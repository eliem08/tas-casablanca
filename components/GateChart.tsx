"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface GateChartProps {
  baseline: [number, number, number];
  optimized: [number, number, number];
  showOptimized: boolean;
  labels?: string[];
}

const DEFAULT_LABELS = [
  "Gate 1 · East Container",
  "Gate 2 · Bulk & Grain",
  "Gate 3 · Reefer",
];

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-ink-950 px-4 py-3 text-white shadow-lg">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/60">
        {label}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="tnum text-sm">
          <span
            className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: p.color }}
          />
          {p.name}: <strong>{(p.value as number).toFixed(1)}%</strong>
        </p>
      ))}
    </div>
  );
}

export default function GateChart({
  baseline,
  optimized,
  showOptimized,
  labels = DEFAULT_LABELS,
}: GateChartProps) {
  const data = [0, 1, 2].map((i) => ({
    gate: labels[i],
    short: `Gate ${i + 1}`,
    baseline: Math.round(baseline[i] * 1000) / 10,
    optimized: Math.round(optimized[i] * 1000) / 10,
  }));

  return (
    <div className="card overflow-hidden p-0">
      <div className="p-6 pb-2">
        <h3 className="font-display text-lg font-semibold text-ink-950">
          Gate utilization
        </h3>
        <p className="text-sm text-ink-900/60">
          Share of operating time each gate is busy
        </p>
      </div>
      <div className="h-[300px] px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0A1628" opacity={0.08} />
            <XAxis
              dataKey="short"
              tick={{ fontSize: 12, fill: "#0A1628", opacity: 0.7 }}
              tickLine={false}
              axisLine={{ stroke: "#0A1628", opacity: 0.15 }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#0A1628", opacity: 0.6 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 100]}
            />
            <Tooltip content={<BarTooltip />} cursor={{ fill: "#0A1628", opacity: 0.04 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="baseline"
              name="Status quo"
              fill="#94A3B8"
              radius={[6, 6, 0, 0]}
              maxBarSize={48}
            />
            {showOptimized && (
              <Bar
                dataKey="optimized"
                name="With TAS"
                fill="#E8A317"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
