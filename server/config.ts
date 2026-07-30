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
// DATA_DIR now isolates only the local companion's credential/preferences
// file. Hosted usage data lives in the deployment's Postgres database.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
const CONFIG_PATH = path.join(DATA_DIR, "local-config.json");

/** Secret/path values are exposed to the frontend as set/unset booleans only. */
export const CREDENTIAL_CONFIG_KEYS = {
  TOKEN_APP_API_URL: "TOKEN_APP_API_URL",
  TOKEN_APP_API_SECRET: "TOKEN_APP_API_SECRET",
  VERCEL_TOKEN: "VERCEL_TOKEN",
  VERCEL_TEAM_ID: "VERCEL_TEAM_ID",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  CODEX_HOME: "CODEX_HOME",
  GOOGLE_APPLICATION_CREDENTIALS: "GOOGLE_APPLICATION_CREDENTIALS",
  GEMINI_GCP_PROJECT_ID: "GEMINI_GCP_PROJECT_ID",
} as const;

/** Non-secret plan overrides are safe to return to the browser. */
export const PLAN_CONFIG_KEYS = {
  claude: "CLAUDE_PLAN",
  codex: "CODEX_PLAN",
  gemini: "GEMINI_PLAN",
  vercel: "VERCEL_PLAN",
  cursor: "CURSOR_PLAN",
} as const;

/** Every key this app knows how to persist. */
export const CONFIG_KEYS = {
  ...CREDENTIAL_CONFIG_KEYS,
  CLAUDE_PLAN: "CLAUDE_PLAN",
  CODEX_PLAN: "CODEX_PLAN",
  GEMINI_PLAN: "GEMINI_PLAN",
  VERCEL_PLAN: "VERCEL_PLAN",
  CURSOR_PLAN: "CURSOR_PLAN",
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;
export type CredentialConfigKey = keyof typeof CREDENTIAL_CONFIG_KEYS;
export type PlanPlatformId = keyof typeof PLAN_CONFIG_KEYS;

export type LocalConfig = Partial<Record<ConfigKey, string>>;
export type PlanSelections = Partial<Record<PlanPlatformId, string>>;

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
  for (const key of Object.keys(
    CREDENTIAL_CONFIG_KEYS
  ) as CredentialConfigKey[]) {
    const value = cfg[key];
    if (value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

/** Status only (which keys are set) — safe to return to the frontend, never the values themselves. */
export function configStatus(): Record<CredentialConfigKey, boolean> {
  const cfg = readConfig();
  const status = {} as Record<CredentialConfigKey, boolean>;
  for (const key of Object.keys(
    CREDENTIAL_CONFIG_KEYS
  ) as CredentialConfigKey[]) {
    status[key] = Boolean(cfg[key]);
  }
  return status;
}

/** Plan IDs are ordinary preferences, not credentials, so Settings can read them back. */
export function planSelections(): PlanSelections {
  const cfg = readConfig();
  const selections: PlanSelections = {};
  for (const [platformId, configKey] of Object.entries(PLAN_CONFIG_KEYS) as [
    PlanPlatformId,
    (typeof PLAN_CONFIG_KEYS)[PlanPlatformId],
  ][]) {
    const value = cfg[configKey]?.trim();
    if (value) selections[platformId] = value;
  }
  return selections;
}
