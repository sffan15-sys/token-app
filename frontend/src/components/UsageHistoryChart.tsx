import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatShortTime } from "../lib/format";

interface Point {
  fetched_at: string;
  value: number;
}

/**
 * Full-detail usage curve for the current window — the "is today's
 * shape unusual" question, which is exactly what a line chart is for
 * once someone is a click deep. Real axes, gridlines, hover tooltip.
 */
export function UsageHistoryChart({ data, color }: { data: Point[]; color: string }) {
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis
            dataKey="fetched_at"
            tickFormatter={(v: string) => new Date(v).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            stroke="var(--border-strong)"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-strong)" }}
            minTickGap={40}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            stroke="var(--border-strong)"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: "var(--gridline)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--text-secondary)" }}
            labelFormatter={(label) => formatShortTime(label as string)}
            formatter={(value) => [`${value}%`, "used"]}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
