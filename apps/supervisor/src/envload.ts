/**
 * Load monorepo env before AppModule (repo root `.env` is canonical for local dev).
 */
import { existsSync } from "fs";
import { resolve } from "path";
import { config as loadEnv } from "dotenv";

const rootEnv = resolve(__dirname, "../../..", ".env");
const supervisorEnv = resolve(__dirname, "..", ".env");

if (existsSync(rootEnv)) {
  loadEnv({ path: rootEnv });
}
if (existsSync(supervisorEnv)) {
  loadEnv({ path: supervisorEnv, override: true });
}
