import { useMemo } from "react";
import { PLATFORMS } from "../data/mockData";
import { fetchErrors, fetchLatestUsage, useFetch } from "../lib/api";
import { deriveAlerts } from "../lib/alerts";
import { formatRelativeTime } from "../lib/format";
import type { AlertSeverity } from "../types";

const SEVERITY_VAR: Record<AlertSeverity, string> = {
  critical: "--status-critical",
  serious: "--status-serious",
  warning: "--status-warning",
  info: "--status-stale",
};

export function Alerts() {
  const { data: records, loading: loadingUsage, error: usageError } = useFetch(fetchLatestUsage);
  const { data: errors, loading: loadingErrors, error: errorsError } = useFetch(fetchErrors);

  const sorted = useMemo(
    () => deriveAlerts(PLATFORMS, records ?? [], errors ?? []),
    [records, errors]
  );

  const loading = loadingUsage || loadingErrors;
  const error = usageError || errorsError;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Alert history
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Derived from live usage snapshots and collector errors — no baseline/burn-rate anomaly
          engine yet (see CLAUDE.md Step 3/4), so this covers approaching-limit, stale-collector,
          and raw collector-error alerts only.
        </p>
      </div>

      {loading && (
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--status-critical)", color: "var(--text-primary)" }}>
          Couldn't reach the API server ({error}). Start it with <code>npm run server</code>.
        </div>
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-2">
          {sorted.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 rounded-lg border p-3 text-sm"
              style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}
            >
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: `var(${SEVERITY_VAR[a.severity]})` }} />
              <div className="flex-1">
                <div style={{ color: "var(--text-primary)" }}>
                  {a.message}
                  {a.businessTag && (
                    <span className="ml-1.5 font-medium" style={{ color: `var(${SEVERITY_VAR[a.severity]})` }}>
                      — affects {a.businessTag}'s active work
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  {a.platform} · {a.kind.replace(/_/g, " ")} · {formatRelativeTime(a.created_at)}
                  {a.businessTag && ` · ${a.businessTag}`}
                  {!a.active && " · resolved"}
                </div>
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              No alerts — either everything's healthy, or there's no data yet (run a collector or
              log a manual reading in Settings).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
