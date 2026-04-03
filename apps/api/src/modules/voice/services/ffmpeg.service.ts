import { Injectable } from "@nestjs/common";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

export type FfmpegResolutionSource = "env" | "path_scan" | "fallback" | null;

export type FfmpegDiagnostics = {
  cwd: string;
  pathEnv: string;
  available: boolean;
  resolvedPath: string | null;
  resolutionSource: FfmpegResolutionSource;
  attemptedLocations: string[];
  /** True when `FFMPEG_PATH` was set (even if invalid). */
  explicitEnvSet: boolean;
};

type FfmpegStatus = {
  available: boolean;
  path: string | null;
  resolutionSource: FfmpegResolutionSource;
  attemptedLocations: string[];
  envPath: string;
  explicitEnvSet: boolean;
};

export class FfmpegNotFoundError extends Error {
  code = "FFMPEG_NOT_FOUND" as const;
  attemptedLocations: string[];
  envPath: string;
  diagnostics: FfmpegDiagnostics;

  constructor(args: { attemptedLocations: string[]; envPath: string; diagnostics: FfmpegDiagnostics }) {
    super(
      [
        "FFmpeg not found in API runtime.",
        "Set FFMPEG_PATH to an absolute ffmpeg binary, or install ffmpeg and ensure PATH includes it (e.g. /opt/homebrew/bin on Apple Silicon).",
        "macOS: brew install ffmpeg"
      ].join(" ")
    );
    this.name = "FfmpegNotFoundError";
    this.attemptedLocations = args.attemptedLocations;
    this.envPath = args.envPath;
    this.diagnostics = args.diagnostics;
  }
}

/** Fixed candidates after PATH resolution (Homebrew Apple Silicon first). */
const FALLBACK_FFMPEG_PATHS = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"];

@Injectable()
export class FfmpegService {
  private cachedPath: string | null = null;
  private cachedSource: FfmpegResolutionSource = null;

  private isRunnableBinary(pathToCheck: string): boolean {
    const result = spawnSync(pathToCheck, ["-version"], { stdio: "ignore" });
    return result.status === 0;
  }

  /**
   * Deterministic resolution order:
   * 1. process.env.FFMPEG_PATH
   * 2. Each directory in PATH + /ffmpeg
   * 3. Common macOS/Linux absolute paths
   */
  private resolveStatus(): FfmpegStatus {
    const envPath = process.env.PATH ?? "";
    const attemptedLocations: string[] = [];
    const explicit = process.env.FFMPEG_PATH?.trim();
    const explicitEnvSet = Boolean(explicit);

    if (explicit) {
      attemptedLocations.push(`env:FFMPEG_PATH=${explicit}`);
      if (existsSync(explicit) && this.isRunnableBinary(explicit)) {
        return {
          available: true,
          path: explicit,
          resolutionSource: "env",
          attemptedLocations,
          envPath,
          explicitEnvSet
        };
      }
    }

    attemptedLocations.push("PATH_SCAN");
    for (const segment of envPath.split(delimiter)) {
      const dir = segment.trim();
      if (!dir) continue;
      const candidate = join(dir, "ffmpeg");
      attemptedLocations.push(candidate);
      if (existsSync(candidate) && this.isRunnableBinary(candidate)) {
        return {
          available: true,
          path: candidate,
          resolutionSource: "path_scan",
          attemptedLocations,
          envPath,
          explicitEnvSet
        };
      }
    }

    for (const fallback of FALLBACK_FFMPEG_PATHS) {
      attemptedLocations.push(`fallback:${fallback}`);
      if (existsSync(fallback) && this.isRunnableBinary(fallback)) {
        return {
          available: true,
          path: fallback,
          resolutionSource: "fallback",
          attemptedLocations,
          envPath,
          explicitEnvSet
        };
      }
    }

    return {
      available: false,
      path: null,
      resolutionSource: null,
      attemptedLocations,
      envPath,
      explicitEnvSet
    };
  }

  getDiagnosticsSnapshot(): FfmpegDiagnostics {
    const cwd = process.cwd();
    const envPath = process.env.PATH ?? "";
    const explicit = process.env.FFMPEG_PATH?.trim();
    const explicitEnvSet = Boolean(explicit);

    if (this.cachedPath && this.cachedSource) {
      return {
        cwd,
        pathEnv: envPath,
        available: true,
        resolvedPath: this.cachedPath,
        resolutionSource: this.cachedSource,
        attemptedLocations: [this.cachedPath],
        explicitEnvSet
      };
    }

    const status = this.resolveStatus();
    return {
      cwd,
      pathEnv: envPath,
      available: status.available,
      resolvedPath: status.path,
      resolutionSource: status.resolutionSource,
      attemptedLocations: status.attemptedLocations,
      explicitEnvSet
    };
  }

  getFfmpegPath(): string {
    if (this.cachedPath) return this.cachedPath;
    const status = this.resolveStatus();
    if (!status.available || !status.path) {
      const diag: FfmpegDiagnostics = {
        cwd: process.cwd(),
        pathEnv: status.envPath,
        available: false,
        resolvedPath: null,
        resolutionSource: null,
        attemptedLocations: status.attemptedLocations,
        explicitEnvSet: status.explicitEnvSet
      };
      throw new FfmpegNotFoundError({
        attemptedLocations: status.attemptedLocations,
        envPath: status.envPath,
        diagnostics: diag
      });
    }
    this.cachedPath = status.path;
    this.cachedSource = status.resolutionSource;
    return status.path;
  }

  assertAvailable(): void {
    this.getFfmpegPath();
  }

  getStatus(): FfmpegStatus {
    try {
      const path = this.getFfmpegPath();
      return {
        available: true,
        path,
        resolutionSource: this.cachedSource,
        attemptedLocations: [path],
        envPath: process.env.PATH ?? "",
        explicitEnvSet: Boolean(process.env.FFMPEG_PATH?.trim())
      };
    } catch (err) {
      if (err instanceof FfmpegNotFoundError) {
        return {
          available: false,
          path: null,
          resolutionSource: null,
          attemptedLocations: err.attemptedLocations,
          envPath: err.envPath,
          explicitEnvSet: err.diagnostics.explicitEnvSet
        };
      }
      throw err;
    }
  }
}
