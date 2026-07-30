import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Bucket {
  windowStart: string;
  peak: number;
}

/**
 * "Waste per window over time" — one bar per past window's peak %
 * used before reset. Bars, not a line: these are discrete windows
 * with no meaningful interpolation between window N and N+1.
 */
export function EfficiencyBars({ data }: { data: Bucket[] }) {
  return (
    <div style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
          <XAxis
            dataKey="windowStart"
            tickFormatter={(v: string) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            stroke="var(--border-strong)"
            tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-strong)" }}
          />
          <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: "var(--text-muted)", fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ fill: "var(--gridline)", opacity: 0.4 }}
            contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "var(--text-secondary)" }}
            formatter={(value) => [`${value}%`, "peak used"]}
          />
          <Bar dataKey="peak" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.windowStart} fill={d.peak >= 90 ? "var(--status-critical)" : d.peak >= 70 ? "var(--status-warning)" : "var(--series-blue)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
