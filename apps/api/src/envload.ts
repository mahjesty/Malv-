/**
 * Load monorepo env before AppModule is imported so TypeORM and JWT defaults
 * see the same DB_* / JWT_* values as ConfigModule (repo root .env is canonical).
 *
 * Voice (API local STT): optional absolute path to ffmpeg if the Node process PATH
 * does not include Homebrew (e.g. `FFMPEG_PATH=/opt/homebrew/bin/ffmpeg`).
 */
import { existsSync } from "fs";
import { resolve } from "path";
import { config as loadEnv } from "dotenv";

const rootEnv = resolve(__dirname, "../../..", ".env");
const apiEnv = resolve(__dirname, "..", ".env");

if (existsSync(rootEnv)) {
  loadEnv({ path: rootEnv });
}
if (existsSync(apiEnv)) {
  loadEnv({ path: apiEnv, override: true });
}
