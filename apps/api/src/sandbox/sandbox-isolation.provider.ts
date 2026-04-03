import { forwardRef, Inject, Injectable, Logger, OnModuleInit, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn } from "child_process";
import path from "path";
import { SecurityEventService } from "../security/security-event.service";

export type SandboxIsolationEnforcementClass = "container_enforced" | "os_enforced" | "best_effort";
export type SandboxIsolationNetworkPolicy = "deny" | "allow";

export type SandboxIsolationExecutionRequest = {
  executable: string;
  args: string[];
  cwd: string;
  workspaceRoot: string;
  timeoutMs: number;
  allowNetwork: boolean;
  stdinText?: string;
};

export type SandboxIsolationExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  isolationMetadata: {
    provider: string;
    enforcementClass: SandboxIsolationEnforcementClass;
    networkPolicyRequested: SandboxIsolationNetworkPolicy;
    networkPolicyActual: string;
    workspaceRoot: string;
    executable: string;
    timeoutMs: number;
    timeoutTriggered: boolean;
    outputCapTriggered: boolean;
    cleanupStatus: "ok" | "failed";
  };
};

export type SandboxIsolatedFileReadResult = {
  content: string;
  isolationMetadata: SandboxIsolationExecutionResult["isolationMetadata"];
};

export type SandboxIsolatedListDirectoryResult = {
  entries: string[];
  isolationMetadata: SandboxIsolationExecutionResult["isolationMetadata"];
};

@Injectable()
export class SandboxIsolationProvider implements OnModuleInit {
  private readonly logger = new Logger(SandboxIsolationProvider.name);
  private initialized = false;
  private selectedMode: "local" | "docker" | null = null;
  /** Set true after docker probes succeed in onModuleInit. */
  private dockerHealthy = false;

  constructor(
    private readonly cfg: ConfigService,
    @Optional() @Inject(forwardRef(() => SecurityEventService)) private readonly securityEvents?: SecurityEventService
  ) {}

  private outputCapBytes(envKey: string, fallback: number): number {
    const raw = Number(this.cfg.get<string>(envKey) ?? String(fallback));
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(1024, Math.min(2_000_000, Math.floor(raw)));
  }

  private appendCapped(current: string, chunk: Buffer, capBytes: number): string {
    if (Buffer.byteLength(current, "utf8") >= capBytes) return current;
    const remaining = capBytes - Buffer.byteLength(current, "utf8");
    const next = chunk.subarray(0, remaining).toString("utf8");
    return current + next;
  }

  private providerMode(): "local" | "docker" {
    const mode = String(this.cfg.get<string>("SANDBOX_ISOLATION_PROVIDER") ?? "local")
      .trim()
      .toLowerCase();
    if (mode !== "local" && mode !== "docker") {
      throw new ServiceUnavailableException("Invalid SANDBOX_ISOLATION_PROVIDER. Allowed values: local, docker.");
    }
    return mode;
  }

  private isProduction(): boolean {
    return (process.env.NODE_ENV ?? "").toLowerCase() === "production";
  }

  private startupHealthcheckTimeoutMs(): number {
    const raw = Number(this.cfg.get<string>("SANDBOX_DOCKER_HEALTHCHECK_TIMEOUT_MS") ?? "30000");
    if (!Number.isFinite(raw)) return 30_000;
    return Math.max(5_000, Math.min(120_000, Math.floor(raw)));
  }

  private buildLocalEnv(allowNetwork: boolean): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR ?? process.env.TEMP ?? "/tmp",
      LANG: process.env.LANG ?? "C.UTF-8",
      LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
      CI: "true",
      MALV_SANDBOXED_EXECUTION: "1",
      MALV_SANDBOX_ISOLATION_PROVIDER: "local"
    };
    if (!allowNetwork) {
      env.NO_PROXY = "*";
      env.HTTP_PROXY = "http://127.0.0.1:9";
      env.HTTPS_PROXY = "http://127.0.0.1:9";
      env.ALL_PROXY = "http://127.0.0.1:9";
      env.npm_config_offline = "true";
      env.npm_config_fund = "false";
      env.npm_config_audit = "false";
      env.YARN_ENABLE_NETWORK = "0";
      env.PNPM_FETCH_RETRIES = "0";
      env.PNPM_NETWORK_CONCURRENCY = "1";
    }
    return env;
  }

  private dockerImage(): string {
    return this.cfg.get<string>("SANDBOX_DOCKER_IMAGE") ?? "node:20-alpine";
  }

  private buildDockerInvocation(args: SandboxIsolationExecutionRequest): { file: string; argv: string[] } {
    const networkMode = args.allowNetwork ? "bridge" : "none";
    const workspace = path.resolve(args.workspaceRoot);
    const workdir = path.resolve(args.cwd).startsWith(workspace) ? `/workspace/${path.relative(workspace, args.cwd)}` : "/workspace";
    const dockerArgs = [
      "run",
      "--rm",
      "--network",
      networkMode,
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "128",
      "-u",
      "65534:65534",
      "-w",
      workdir,
      "-v",
      `${workspace}:/workspace:rw`,
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--env",
      "CI=true",
      "--env",
      "MALV_SANDBOXED_EXECUTION=1",
      "--env",
      "MALV_SANDBOX_ISOLATION_PROVIDER=docker",
      this.dockerImage(),
      args.executable,
      ...args.args
    ];
    return { file: "docker", argv: dockerArgs };
  }

  private async runProbe(file: string, argv: string[], timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(file, argv, { env: { ...process.env } });
      let done = false;
      let stderr = "";
      const finish = (err?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new ServiceUnavailableException(`Sandbox isolation probe timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      child.stderr.on("data", (d) => {
        stderr += d.toString("utf8");
      });
      child.on("error", (err) => finish(new ServiceUnavailableException(`Sandbox isolation probe failed: ${err.message}`)));
      child.on("close", (code) => {
        if ((code ?? 1) !== 0) {
          finish(new ServiceUnavailableException(`Sandbox isolation probe failed (exit ${code ?? 1}): ${stderr.slice(0, 4000)}`));
          return;
        }
        finish();
      });
    });
  }

  async onModuleInit(): Promise<void> {
    const mode = this.providerMode();
    this.selectedMode = mode;
    if (this.isProduction() && mode !== "docker") {
      throw new ServiceUnavailableException("Production requires SANDBOX_ISOLATION_PROVIDER=docker.");
    }
    if (mode === "docker") {
      const timeoutMs = this.startupHealthcheckTimeoutMs();
      try {
        await this.runProbe("docker", ["version", "--format", "{{.Server.Version}}"], timeoutMs);
        await this.runProbe("docker", ["run", "--rm", "--network", "none", this.dockerImage(), "node", "-e", "process.exit(0)"], timeoutMs);
        this.dockerHealthy = true;
        this.logger.log("sandbox isolation provider initialized: docker");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.securityEvents?.emitBestEffort({
          eventType: "sandbox.provider.init_failed",
          severity: "critical",
          subsystem: "sandbox_isolation",
          summary: `Docker sandbox provider health check failed: ${msg.slice(0, 500)}`,
          details: { error: msg, provider: "docker" }
        });
        throw e;
      }
    } else {
      this.logger.warn("sandbox isolation provider initialized: local (best_effort)");
    }
    this.initialized = true;
  }

  /** For admin security posture: docker probes succeeded at startup. */
  getDockerHealthSnapshot(): "ok" | "unknown" | "not_applicable" {
    if (this.selectedMode !== "docker") return "not_applicable";
    return this.dockerHealthy ? "ok" : "unknown";
  }

  getEnforcementClassSnapshot(): SandboxIsolationEnforcementClass | "unknown" {
    if (this.selectedMode === "docker") return "container_enforced";
    if (this.selectedMode === "local") return "best_effort";
    return "unknown";
  }

  getSelectedMode(): "local" | "docker" | null {
    return this.selectedMode;
  }

  private assertInitialized(): void {
    if (!this.initialized || !this.selectedMode) {
      throw new ServiceUnavailableException("Sandbox isolation provider is not initialized.");
    }
  }

  async execute(args: SandboxIsolationExecutionRequest): Promise<SandboxIsolationExecutionResult> {
    this.assertInitialized();
    const mode = this.selectedMode!;
    const invocation =
      mode === "docker"
        ? this.buildDockerInvocation(args)
        : { file: args.executable, argv: args.args };
    const spawnEnv = mode === "docker" ? undefined : this.buildLocalEnv(args.allowNetwork);
    const enforcementClass: SandboxIsolationEnforcementClass = mode === "docker" ? "container_enforced" : "best_effort";

    return await new Promise((resolve, reject) => {
      const child = spawn(invocation.file, invocation.argv, {
        cwd: args.cwd,
        env: spawnEnv
      });
      if (args.stdinText !== undefined) {
        child.stdin.write(args.stdinText, "utf8");
        child.stdin.end();
      }
      const stdoutCap = this.outputCapBytes("OPERATOR_STDOUT_MAX_BYTES", 120_000);
      const stderrCap = this.outputCapBytes("OPERATOR_STDERR_MAX_BYTES", 16_000);
      let stdout = "";
      let stderr = "";
      let done = false;
      let timeoutTriggered = false;
      let outputCapTriggered = false;
      const finish = (exitCode: number | null, stderrSuffix?: string) => {
        if (done) return;
        done = true;
        if (stderrSuffix) stderr = `${stderr}${stderrSuffix}`;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode,
          isolationMetadata: {
            provider: mode,
            enforcementClass,
            networkPolicyRequested: args.allowNetwork ? "allow" : "deny",
            networkPolicyActual: mode === "docker" ? (args.allowNetwork ? "container_allow" : "container_deny") : "best_effort_env_proxy_deny",
            workspaceRoot: path.resolve(args.workspaceRoot),
            executable: args.executable,
            timeoutMs: args.timeoutMs,
            timeoutTriggered,
            outputCapTriggered,
            cleanupStatus: "ok"
          }
        });
      };
      const timer = setTimeout(() => {
        if (done) return;
        timeoutTriggered = true;
        child.kill("SIGKILL");
        finish(124, `\n[timeout after ${args.timeoutMs}ms]`);
      }, args.timeoutMs);
      child.stdout.on("data", (d) => {
        stdout = this.appendCapped(stdout, d, stdoutCap);
        if (Buffer.byteLength(stdout, "utf8") >= stdoutCap && !done) {
          outputCapTriggered = true;
          child.kill("SIGKILL");
          finish(125, "\n[stdout capped]");
        }
      });
      child.stderr.on("data", (d) => {
        stderr = this.appendCapped(stderr, d, stderrCap);
        if (Buffer.byteLength(stderr, "utf8") >= stderrCap && !done) {
          outputCapTriggered = true;
          child.kill("SIGKILL");
          finish(125, "\n[stderr capped]");
        }
      });
      child.on("error", (err) => {
        this.logger.warn(`sandbox isolation spawn failed: ${err.message}`);
        clearTimeout(timer);
        done = true;
        reject(new ServiceUnavailableException(`Sandbox isolation execution failed: ${err.message}`));
      });
      child.on("close", (code) => {
        finish(code);
      });
    });
  }

  async readFileIsolated(args: {
    path: string;
    cwd: string;
    workspaceRoot: string;
    timeoutMs: number;
  }): Promise<SandboxIsolatedFileReadResult> {
    const script = "const fs=require('fs');const p=process.argv[1];const c=fs.readFileSync(p,'utf8');process.stdout.write(c);";
    const out = await this.execute({
      executable: "node",
      args: ["-e", script, args.path],
      cwd: args.cwd,
      workspaceRoot: args.workspaceRoot,
      timeoutMs: args.timeoutMs,
      allowNetwork: false
    });
    if (out.exitCode !== 0) {
      throw new ServiceUnavailableException(`Sandbox isolated read failed with exit ${out.exitCode ?? 1}.`);
    }
    return { content: out.stdout, isolationMetadata: out.isolationMetadata };
  }

  async writeFileIsolated(args: {
    path: string;
    content: string;
    cwd: string;
    workspaceRoot: string;
    timeoutMs: number;
  }): Promise<SandboxIsolationExecutionResult["isolationMetadata"]> {
    const script =
      "const fs=require('fs');const p=process.argv[1];let d='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{fs.writeFileSync(p,d,'utf8');});";
    const out = await this.execute({
      executable: "node",
      args: ["-e", script, args.path],
      cwd: args.cwd,
      workspaceRoot: args.workspaceRoot,
      timeoutMs: args.timeoutMs,
      allowNetwork: false,
      stdinText: args.content
    });
    if (out.exitCode !== 0) {
      throw new ServiceUnavailableException(`Sandbox isolated write failed with exit ${out.exitCode ?? 1}.`);
    }
    return out.isolationMetadata;
  }

  async listDirectoryIsolated(args: {
    path: string;
    cwd: string;
    workspaceRoot: string;
    timeoutMs: number;
  }): Promise<SandboxIsolatedListDirectoryResult> {
    const script = "const fs=require('fs');const p=process.argv[1];const e=fs.readdirSync(p);process.stdout.write(JSON.stringify(e));";
    const out = await this.execute({
      executable: "node",
      args: ["-e", script, args.path],
      cwd: args.cwd,
      workspaceRoot: args.workspaceRoot,
      timeoutMs: args.timeoutMs,
      allowNetwork: false
    });
    if (out.exitCode !== 0) {
      throw new ServiceUnavailableException(`Sandbox isolated list_directory failed with exit ${out.exitCode ?? 1}.`);
    }
    let entries: string[] = [];
    try {
      entries = JSON.parse(out.stdout || "[]");
    } catch {
      throw new ServiceUnavailableException("Sandbox isolated list_directory returned invalid output.");
    }
    if (!Array.isArray(entries) || entries.some((x) => typeof x !== "string")) {
      throw new ServiceUnavailableException("Sandbox isolated list_directory returned malformed entries.");
    }
    return { entries, isolationMetadata: out.isolationMetadata };
  }
}
