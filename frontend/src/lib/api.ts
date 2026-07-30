/**
 * Fetch-based data layer for the local API server (see server/app.ts).
 * Plain fetch + useState/useEffect hooks — no React Query, to keep deps
 * minimal for a single-user local tool with a handful of endpoints.
 *
 * Base URL: VITE_API_BASE env var if set, otherwise http://localhost:8787
 * (the default port server/index.ts listens on).
 */
import { useEffect, useState } from "react";
import type {
  PlanPlatformId,
  PlanSelections,
  UsageRecord,
} from "../types";
import { MOCK_USAGE_RECORDS } from "../data/mockData";

const ENV = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
const API_BASE = ENV.VITE_API_BASE || "http://localhost:8787";
/**
 * Set by vite.config.demo.ts for the single-file shareable demo build, which
 * has no backend behind it (it's a static file on GitHub Pages / a claude.ai
 * artifact). In that mode, serve mock data instead of hitting a localhost
 * API that will never be reachable from the viewer's machine.
 */
const DEMO_MODE = ENV.VITE_DEMO_MODE === "true";

export interface CollectorErrorRow {
  id: number;
  platform: string;
  occurred_at: string;
  kind: string;
  message: string;
  raw: string | null;
}

export interface ConfigStatus {
  VERCEL_TOKEN: boolean;
  VERCEL_TEAM_ID: boolean;
  OPENAI_API_KEY: boolean;
  CODEX_HOME: boolean;
  GOOGLE_APPLICATION_CREDENTIALS: boolean;
  GEMINI_GCP_PROJECT_ID: boolean;
}

export type PlanConfigKey =
  | "CLAUDE_PLAN"
  | "CODEX_PLAN"
  | "GEMINI_PLAN"
  | "VERCEL_PLAN"
  | "CURSOR_PLAN";

export type ConfigKey = keyof ConfigStatus | PlanConfigKey;

export interface ConfigResponse {
  status: ConfigStatus;
  plans: PlanSelections;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} returned HTTP ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export function fetchLatestUsage(): Promise<UsageRecord[]> {
  if (DEMO_MODE) return Promise.resolve(MOCK_USAGE_RECORDS);
  return getJson<{ records: UsageRecord[] }>("/api/usage").then((d) => d.records);
}

export function fetchPlatformUsage(
  platform: string,
  limit = 2000
): Promise<UsageRecord[]> {
  if (DEMO_MODE) return Promise.resolve(MOCK_USAGE_RECORDS.filter((r) => r.platform === platform));
  return getJson<{ records: UsageRecord[] }>(
    `/api/usage/${encodeURIComponent(platform)}?limit=${limit}`
  ).then((d) => d.records);
}

/** Full-enough history for completed-window and billing-period waste estimates. */
export async function fetchWasteHistory(): Promise<UsageRecord[]> {
  if (DEMO_MODE) return MOCK_USAGE_RECORDS;
  const platformIds: PlanPlatformId[] = ["claude", "codex", "vercel"];
  const history = await Promise.all(
    platformIds.map((platformId) => fetchPlatformUsage(platformId, 5000))
  );
  return history.flat();
}

export function fetchErrors(): Promise<CollectorErrorRow[]> {
  if (DEMO_MODE) return Promise.resolve([]);
  return getJson<{ errors: CollectorErrorRow[] }>("/api/errors").then((d) => d.errors);
}

const DEMO_CONFIG_STATUS: ConfigStatus = {
  VERCEL_TOKEN: false,
  VERCEL_TEAM_ID: false,
  OPENAI_API_KEY: false,
  CODEX_HOME: false,
  GOOGLE_APPLICATION_CREDENTIALS: false,
  GEMINI_GCP_PROJECT_ID: false,
};
const DEMO_CONFIG: ConfigResponse = {
  status: DEMO_CONFIG_STATUS,
  plans: {},
};

export function postManualLog(entry: {
  platform: string;
  value: number;
  metric?: string;
  unit?: string;
  businessTag?: string;
}): Promise<{ record: UsageRecord }> {
  if (DEMO_MODE) {
    return Promise.reject(new Error("This is a static demo build with no backend — manual log entries aren't saved here."));
  }
  return postJson("/api/manual-log", entry);
}

export function fetchConfig(): Promise<ConfigResponse> {
  if (DEMO_MODE) return Promise.resolve(DEMO_CONFIG);
  return getJson<ConfigResponse>("/api/config");
}

export function fetchConfigStatus(): Promise<ConfigStatus> {
  return fetchConfig().then((config) => config.status);
}

export function saveConfig(
  patch: Partial<Record<ConfigKey, string>>
): Promise<ConfigResponse> {
  if (DEMO_MODE) {
    return Promise.reject(new Error("This is a static demo build with no backend — settings aren't saved here."));
  }
  return postJson<ConfigResponse>("/api/config", patch);
}

/**
 * Generic "fetch on mount" hook shared by the pages below. Returns loading/error/data so
 * every page can render a sensible empty/loading state instead of crashing against a fresh,
 * still-empty DB (no collectors have run yet) or a server that isn't started.
 */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}
