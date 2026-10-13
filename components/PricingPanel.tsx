"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorNote, LoadingSpinner } from "./ui";

interface PricingData {
  day: number;
  trucks: number;
  seed: number;
  basePrice: number;
  surcharge: number;
  basePeakLoad: number;
  pricedPeakLoad: number;
  peakReductionPct: number;
  revenue: number;
  shiftedCount: number;
  avgDisplacementMin: number;
  avgPricePaid: number;
}

/**
 * Congestion-pricing mechanism experiment. Slots are priced by time of day
 * and load; carriers re-centre toward cheaper slots; the terminal
 * re-optimizes. Prices are illustrative — not a real tariff proposal.
 */
export default function PricingPanel({
  trucks,
  seed,
  day,
}: {
  trucks: number;
  seed: number;
  day: number;
}) {
  const [basePrice, setBasePrice] = useState(25);
  const [surcharge, setSurcharge] = useState(0.5);
  const [data, setData] = useState<PricingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks, seed, day, basePrice, surcharge }),
      });
      if (!res.ok) throw new Error(`Pricing API returned ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pricing experiment failed.");
    } finally {
      setLoading(false);
    }
  }, [trucks, seed, day, basePrice, surcharge]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-950">
            Congestion pricing — a mechanism, not a tariff
          </h3>
          <p className="mt-1 text-sm text-ink-900/60">
            Peak slots cost more, off-peak slots are discounted, loaded slots
            carry a surcharge. Carriers trade schedule displacement against
            price (synthetic willingness-to-pay). The question: does pricing
            flatten the peak — and at what revenue?
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-900/60">
            Base price $
            <input
              type="number"
              min={0}
              max={200}
              value={basePrice}
              onChange={(e) => setBasePrice(Math.max(0, Math.min(200, Number(e.target.value) || 25)))}
              className="w-16 rounded-lg border border-ink-900/15 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-900/60">
            Load surcharge σ
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={surcharge}
              onChange={(e) => setSurcharge(Number(e.target.value))}
              className="w-20"
            />
            <span className="tnum w-8 text-sm text-ink-900">{surcharge.toFixed(1)}</span>
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-ink-900/15 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:border-ink-900/30 disabled:opacity-50"
          >
            {loading ? "Pricing…" : "Re-run"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote message={error} onRetry={load} />
        </div>
      )}
      {loading && !data && <LoadingSpinner label="Pricing slots and re-optimizing…" />}

      {data && (
        <div className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                Peak slot load
              </p>
              <p className="tnum font-display mt-1 text-2xl font-bold">
                {data.basePeakLoad} → {data.pricedPeakLoad}
              </p>
              <p className="mt-1 text-xs font-semibold text-sea-700">
                −{data.peakReductionPct.toFixed(1)}% peak flattening
              </p>
            </div>
            <div className="rounded-xl bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                Daily revenue
              </p>
              <p className="tnum font-display mt-1 text-2xl font-bold">
                ${data.revenue.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-ink-900/55">
                Avg ${data.avgPricePaid.toFixed(2)} / truck
              </p>
            </div>
            <div className="rounded-xl bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                Carriers shifted
              </p>
              <p className="tnum font-display mt-1 text-2xl font-bold">
                {data.shiftedCount} / {data.trucks}
              </p>
              <p className="mt-1 text-xs text-ink-900/55">
                Avg displacement {data.avgDisplacementMin.toFixed(0)} min
              </p>
            </div>
            <div className="rounded-xl bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                Price tiers
              </p>
              <p className="tnum font-display mt-1 text-2xl font-bold">
                ×1.8 / ×1.15 / ×0.6
              </p>
              <p className="mt-1 text-xs text-ink-900/55">
                Peak 07–11h / shoulder / off-peak
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-900/50">
            Price rule: p = P₀ · tier · (1 + σ · loadFactor), tiers ×1.8 /
            ×1.15 / ×0.6.
            minimizes p + VoT · displacement, with synthetic VoT drawn
            $30–120/h. This demonstrates the mechanism on synthetic demand —
            it is not a tariff proposal, and real carrier behaviour would
            need measured willingness-to-pay.
          </p>
        </div>
      )}
    </div>
  );
}
