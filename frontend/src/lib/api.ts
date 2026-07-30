/**
 * Fetch-based data layer for the local API server (see server/app.ts).
 * Plain fetch + useState/useEffect hooks — no React Query, to keep deps
 * minimal for a single-user local tool with a handful of endpoints.
 *
 * Base URL: VITE_API_BASE env var if set, otherwise http://localhost:8787
 * (the default port server/index.ts listens on).
 */
import { useEffect, useState } from "react";
import type { UsageRecord } from "../types";

const API_BASE = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE || "http://localhost:8787";

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
  return getJson<{ records: UsageRecord[] }>("/api/usage").then((d) => d.records);
}

export function fetchPlatformUsage(platform: string): Promise<UsageRecord[]> {
  return getJson<{ records: UsageRecord[] }>(`/api/usage/${encodeURIComponent(platform)}`).then((d) => d.records);
}

export function fetchErrors(): Promise<CollectorErrorRow[]> {
  return getJson<{ errors: CollectorErrorRow[] }>("/api/errors").then((d) => d.errors);
}

export function postManualLog(entry: {
  platform: string;
  value: number;
  metric?: string;
  unit?: string;
  businessTag?: string;
}): Promise<{ record: UsageRecord }> {
  return postJson("/api/manual-log", entry);
}

export function fetchConfigStatus(): Promise<ConfigStatus> {
  return getJson<{ status: ConfigStatus }>("/api/config").then((d) => d.status);
}

export function saveConfig(patch: Partial<Record<keyof ConfigStatus, string>>): Promise<ConfigStatus> {
  return postJson<{ status: ConfigStatus }>("/api/config", patch).then((d) => d.status);
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
