import { STATUS_VAR } from "../lib/status";
import type { Status } from "../types";

interface GaugeProps {
  percent: number | null;
  status: Status;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

/**
 * Radial progress ring for "how much of my window is left, right now."
 * Chosen over a line chart per design/ux-brainstorm.md: a single current
 * value against a known ceiling reads in under a second.
 */
export function Gauge({ percent, status, size = 96, strokeWidth = 8, label }: GaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = percent ?? 0;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circumference;
  const color = `var(${STATUS_VAR[status]})`;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--gridline)"
          strokeWidth={strokeWidth}
        />
        {percent !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-xl font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
          {percent !== null ? `${Math.round(percent)}%` : "—"}
        </span>
        {label && (
          <span className="text-[10px] mt-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
