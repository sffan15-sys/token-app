import { MOCK_ALERTS } from "../data/mockData";
import { formatRelativeTime } from "../lib/format";
import type { AlertSeverity } from "../types";

const SEVERITY_VAR: Record<AlertSeverity, string> = {
  critical: "--status-critical",
  serious: "--status-serious",
  warning: "--status-warning",
  info: "--status-stale",
};

export function Alerts() {
  const sorted = [...MOCK_ALERTS].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Alert history
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Active alerts also surface at the top of Home. This is the full log, useful once threshold
          tuning exists.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((a) => (
          <div
            key={a.id}
            className="flex items-start gap-3 rounded-lg border p-3 text-sm"
            style={{ background: "var(--surface-card)", borderColor: "var(--border)" }}
          >
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: `var(${SEVERITY_VAR[a.severity]})` }} />
            <div className="flex-1">
              <div style={{ color: "var(--text-primary)" }}>{a.message}</div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {a.platform} · {a.kind.replace(/_/g, " ")} · {formatRelativeTime(a.created_at)}
                {!a.active && " · resolved"}
              </div>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            No alerts yet.
          </div>
        )}
      </div>
    </div>
  );
}
