import { STATUS_VAR } from "../lib/status";
import { formatPercent } from "../lib/format";
import type { Status } from "../types";

/**
 * Small horizontal fill bar for scan-at-a-glance % used, colored by the same
 * status palette as StatusPill/Gauge (--status-good/warning/critical/stale).
 * Deliberately not a sentence — see design/ux-brainstorm.md + owner's
 * explicit "columns and rows, bars not text" ask.
 */
export function UsageBar({
  percent,
  status,
  width = 88,
}: {
  percent: number | null;
  status: Status;
  width?: number;
}) {
  const pct = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-2">
      <div
        className="relative h-2 shrink-0 overflow-hidden rounded-full"
        style={{ width, background: "var(--surface-raised)", border: "1px solid var(--border)" }}
      >
        {percent !== null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%`, background: `var(${STATUS_VAR[status]})` }}
          />
        )}
      </div>
      <span className="tabular text-xs" style={{ color: "var(--text-secondary)", minWidth: "2.5em" }}>
        {percent === null ? "—" : formatPercent(percent)}
      </span>
    </div>
  );
}
