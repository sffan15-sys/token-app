/**
 * Local plaintext API-key/config storage for this single-user tool.
 *
 * Keys are written to data/local-config.json, which lives under the
 * already-gitignored /data/ directory (see .gitignore) so it is never
 * committed. This intentionally does NOT encrypt values — CLAUDE.md
 * explicitly says not to over-engineer this for a single-user local tool,
 * as long as the file is git-ignored and values are never logged/printed.
 *
 * Collectors read credentials from process.env (VERCEL_TOKEN,
 * OPENAI_API_KEY, etc). applyConfigToEnv() copies whatever's saved here
 * into process.env at server/scheduler startup (and before every manual
 * "run now" trigger) so the owner doesn't have to export env vars by hand
 * before `npm run collect:*` — the Settings UI becomes the actual way to
 * set these.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same DATA_DIR override as storage/db.ts - keep them in sync so one
// instance's DB and config always live together.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
const CONFIG_PATH = path.join(DATA_DIR, "local-config.json");

/** Every key this app knows how to persist, mapped to the env var a collector reads. */
export const CONFIG_KEYS = {
  VERCEL_TOKEN: "VERCEL_TOKEN",
  VERCEL_TEAM_ID: "VERCEL_TEAM_ID",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  CODEX_HOME: "CODEX_HOME",
  GOOGLE_APPLICATION_CREDENTIALS: "GOOGLE_APPLICATION_CREDENTIALS",
  GEMINI_GCP_PROJECT_ID: "GEMINI_GCP_PROJECT_ID",
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;

export type LocalConfig = Partial<Record<ConfigKey, string>>;

export function readConfig(): LocalConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as LocalConfig;
    return {};
  } catch {
    return {};
  }
}

/** Merge-write: only overwrites keys present in `patch` (empty string clears a key). */
export function writeConfig(patch: LocalConfig): LocalConfig {
  const current = readConfig();
  const next: LocalConfig = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in CONFIG_KEYS)) continue; // ignore unknown keys defensively
    if (value === "" || value == null) {
      delete next[key as ConfigKey];
    } else {
      next[key as ConfigKey] = value;
    }
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Copies saved config values into process.env, without ever logging them. */
export function applyConfigToEnv(): void {
  const cfg = readConfig();
  for (const key of Object.keys(CONFIG_KEYS) as ConfigKey[]) {
    const value = cfg[key];
    if (value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

/** Status only (which keys are set) — safe to return to the frontend, never the values themselves. */
export function configStatus(): Record<ConfigKey, boolean> {
  const cfg = readConfig();
  const status = {} as Record<ConfigKey, boolean>;
  for (const key of Object.keys(CONFIG_KEYS) as ConfigKey[]) {
    status[key] = Boolean(cfg[key]);
  }
  return status;
}
