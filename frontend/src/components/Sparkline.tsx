import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatShortTime } from "../lib/format";

interface SparklinePoint {
  fetched_at: string;
  value: number;
}

interface SparklineProps {
  data: SparklinePoint[];
  color: string; // CSS var(...) value
  unit?: string;
  height?: number;
}

/**
 * Inline trend indicator for "am I burning faster than usual" at card
 * size. Thin 2px line, no axes/legend (single series, title carries
 * identity per the card header) — full exploration lives in the
 * per-platform detail chart. Includes a lightweight hover tooltip since
 * this is a real plotted series, not a bare stat.
 */
export function Sparkline({ data, color, unit = "%", height = 32 }: SparklineProps) {
  if (data.length < 2) return null;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <XAxis dataKey="fetched_at" hide />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--gridline)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
              padding: "4px 8px",
            }}
            labelFormatter={(label) => formatShortTime(label as string)}
            formatter={(value) => [`${value}${unit}`, ""]}
            labelStyle={{ color: "var(--text-secondary)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
