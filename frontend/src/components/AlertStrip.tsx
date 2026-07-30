import type { Alert, AlertSeverity } from "../types";
import { formatRelativeTime } from "../lib/format";

const SEVERITY_VAR: Record<AlertSeverity, { fg: string; bg: string }> = {
  critical: { fg: "--status-critical", bg: "--status-critical-bg" },
  serious: { fg: "--status-serious", bg: "--status-serious-bg" },
  warning: { fg: "--status-warning", bg: "--status-warning-bg" },
  info: { fg: "--status-stale", bg: "--status-stale-bg" },
};

const SEVERITY_ORDER: AlertSeverity[] = ["critical", "serious", "warning", "info"];

/**
 * Alert banner strip. Empty state is literally nothing rendered — per
 * design/ux-brainstorm.md, silence should read as "fine," not a
 * reassuring green banner, consistent with a status-board mental model.
 */
export function AlertStrip({ alerts }: { alerts: Alert[] }) {
  const active = alerts
    .filter((a) => a.active)
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  if (active.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {active.map((alert) => {
        const colors = SEVERITY_VAR[alert.severity];
        return (
          <div
            key={alert.id}
            className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm"
            style={{
              background: `var(${colors.bg})`,
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          >
            <span
              className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
              style={{ background: `var(${colors.fg})` }}
            />
            <span className="flex-1">{alert.message}</span>
            <span className="shrink-0 text-xs tabular" style={{ color: "var(--text-muted)" }}>
              {formatRelativeTime(alert.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
