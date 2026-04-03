import { Injectable } from "@nestjs/common";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function execWithStdin(args: { cmd: string; argv: string[]; stdinText: string; timeoutMs: number }) {
  const { cmd, argv, stdinText, timeoutMs } = args;
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* noop */
      }
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd}`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`Command failed (code ${code}): ${cmd}\n${stderr || stdout}`));
    });
    try {
      child.stdin.write(stdinText);
      child.stdin.end();
    } catch {
      // ignore
    }
  });
}

@Injectable()
export class LocalTtsService {
  /**
   * Fully self-hosted TTS.
   *
   * Default implementation: Piper CLI (MALV-controlled binary + model).
   * - `MALV_LOCAL_TTS_PROVIDER=piper`
   * - `PIPER_BIN=/path/to/piper`
   * - `PIPER_MODEL=/path/to/voice.onnx`
   */
  async synthesize(args: { text: string }): Promise<{ wavBytes: Buffer }> {
    const provider = (process.env.MALV_LOCAL_TTS_PROVIDER ?? "piper").toLowerCase();
    if (provider !== "piper") {
      throw new Error(`Unsupported MALV_LOCAL_TTS_PROVIDER=${provider} (supported: piper)`);
    }
    const text = (args.text ?? "").trim();
    if (!text) throw new Error("Empty TTS text");

    const sessionId = crypto.randomUUID();
    const dir = await fs.mkdtemp(join(tmpdir(), `malv-tts-${sessionId}-`));
    const outPath = join(dir, "out.wav");
    try {
      const bin = requireEnv("PIPER_BIN");
      const model = requireEnv("PIPER_MODEL");

      // Piper reads text from stdin and writes wav to output file.
      await execWithStdin({
        cmd: bin,
        argv: ["--model", model, "--output_file", outPath],
        stdinText: text + "\n",
        timeoutMs: Number(process.env.MALV_LOCAL_TTS_TIMEOUT_MS ?? 60_000)
      });

      const wavBytes = await fs.readFile(outPath);
      return { wavBytes };
    } finally {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        /* noop */
      }
    }
  }
}

