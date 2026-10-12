"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface QueueChartProps {
  data: Array<{ t: string; baseline: number; optimized: number }>;
  showOptimized: boolean;
}

function ChartTooltip({ active, payload, label }: any) {
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
          {p.name}: <strong>{p.value}</strong> trucks
        </p>
      ))}
    </div>
  );
}

export default function QueueChart({ data, showOptimized }: QueueChartProps) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="p-6 pb-2">
        <h3 className="font-display text-lg font-semibold text-ink-950">
          Queue length through the day
        </h3>
        <p className="text-sm text-ink-900/60">
          Trucks waiting at the gates — discrete-event simulation, 5-minute
          steps
        </p>
      </div>
      <div className="h-[320px] px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0A1628" opacity={0.08} />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 11, fill: "#0A1628", opacity: 0.6 }}
              interval={Math.max(0, Math.floor(data.length / 8) - 1)}
              tickLine={false}
              axisLine={{ stroke: "#0A1628", opacity: 0.15 }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#0A1628", opacity: 0.6 }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "trucks",
                angle: -90,
                position: "insideLeft",
                fontSize: 11,
                fill: "#0A1628",
                opacity: 0.5,
              }}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="baseline"
              name="Status quo (no TAS)"
              stroke="#DC2626"
              strokeWidth={2.5}
              dot={false}
            />
            {showOptimized && (
              <Line
                type="monotone"
                dataKey="optimized"
                name="With TAS"
                stroke="#0D9488"
                strokeWidth={2.5}
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
