import React, { useMemo, useState } from "react";
import { MetricsStep } from "../types";

interface GameChartProps {
  metricsHistory: MetricsStep[];
  currentStep: number;
}

const WIDTH = 280;
const HEIGHT = 64;
const PAD_X = 4;
const PAD_Y = 8;

// Four categorical slots, one hue each, spread around the wheel so no two are
// ever confusable (the original black/white pair were both near-white grays
// on the dark panel and were genuinely hard to tell apart — fixed here).
const COLOR_BLACK = "#38bdf8"; // sky-400 — "negro" series
const COLOR_WHITE = "#fb7185"; // rose-400 — "blanco" series
const COLOR_TEMPERATURE = "#f59e0b"; // amber-500
const COLOR_BOLTZMANN = "#8b5cf6"; // violet-500 — distinct from the other 3 (validated via dataviz's palette script)
const COLOR_GRID = "#383835";
const COLOR_AXIS = "#52514e";

// The first handful of moves produce extreme, not-yet-meaningful territory
// swings (a single stone with no rival nearby technically "owns" almost the
// whole empty board per findTerritoryRegions' definition — real, but it's a
// startup artifact, not signal). Excluding them from the Y-domain keeps that
// spike from compressing the scale for the rest of the game, which is what
// actually matters to read. The spike still exists in the data/tooltip, it's
// just not allowed to dictate the visible range.
const SKIP_MOVES_FOR_SCALE = 6;

function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
  const lo = Math.min(r0, r1);
  const hi = Math.max(r0, r1);
  return (v: number) => Math.max(lo, Math.min(hi, scale(v)));
}

function buildPath(values: number[], xScale: (i: number) => number, yScale: (v: number) => number): string {
  if (values.length === 0) return "";
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
}

interface SeriesSpec {
  key: keyof MetricsStep;
  color: string;
  label: string;
}

function MiniLineChart({
  title,
  series,
  metricsHistory,
  currentStep,
  formatValue,
  caption,
}: {
  title: string;
  series: SeriesSpec[];
  metricsHistory: MetricsStep[];
  currentStep: number;
  formatValue: (v: number) => string;
  caption?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const totalSteps = metricsHistory.length - 1;
  const domainSource =
    metricsHistory.length > SKIP_MOVES_FOR_SCALE * 3 ? metricsHistory.slice(SKIP_MOVES_FOR_SCALE) : metricsHistory;
  const allValues = domainSource.flatMap((m) => series.map((s) => m[s.key] as number));
  const minY = Math.min(0, ...allValues);
  const maxY = Math.max(1, ...allValues);

  const xScale = useMemo(() => scaleLinear([0, Math.max(totalSteps, 1)], [PAD_X, WIDTH - PAD_X]), [totalSteps]);
  const yScale = useMemo(() => scaleLinear([minY, maxY], [HEIGHT - PAD_Y, PAD_Y]), [minY, maxY]);

  const revealed = metricsHistory.slice(0, currentStep + 1);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const idx = Math.round((relX - PAD_X) / ((WIDTH - PAD_X * 2) / Math.max(totalSteps, 1)));
    setHoverIndex(Math.max(0, Math.min(currentStep, idx)));
  };

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono font-bold">{title}</span>
        {series.length > 1 && (
          <div className="flex items-center gap-2">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1 text-[8px] text-slate-500 font-mono">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ height: HEIGHT }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Hairline baseline */}
        <line x1={PAD_X} y1={yScale(0)} x2={WIDTH - PAD_X} y2={yScale(0)} stroke={COLOR_GRID} strokeWidth={1} />

        {series.map((s) => {
          const values = revealed.map((m) => m[s.key] as number);
          const path = buildPath(values, xScale, yScale);
          const lastVal = values[values.length - 1];
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {values.length > 0 && (
                <circle cx={xScale(values.length - 1)} cy={yScale(lastVal)} r={3} fill={s.color} stroke="#1a1a1a" strokeWidth={2} />
              )}
            </g>
          );
        })}

        {hoverIndex !== null && hoverIndex < revealed.length && (
          <line x1={xScale(hoverIndex)} y1={PAD_Y} x2={xScale(hoverIndex)} y2={HEIGHT - PAD_Y} stroke={COLOR_AXIS} strokeWidth={1} strokeDasharray="2,2" />
        )}
      </svg>
      <div className="flex justify-between text-[8px] font-mono text-slate-500 mt-0.5">
        <span>Jugada 0</span>
        {hoverIndex !== null && hoverIndex < revealed.length ? (
          <span className="text-slate-300">
            #{hoverIndex}: {series.map((s) => `${s.label} ${formatValue(revealed[hoverIndex][s.key] as number)}`).join(" · ")}
          </span>
        ) : (
          <span>
            {series
              .map((s) => `${s.label} ${formatValue((revealed[revealed.length - 1]?.[s.key] as number) ?? 0)}`)
              .join(" · ")}
          </span>
        )}
      </div>
      {caption && <div className="text-[8px] text-slate-500 font-mono mt-1 leading-snug">{caption}</div>}
    </div>
  );
}

export default function GameChart({ metricsHistory, currentStep }: GameChartProps) {
  if (metricsHistory.length === 0) {
    return (
      <div className="text-[9px] text-slate-500 uppercase tracking-widest font-mono font-bold">
        Carga una partida para ver la evolución del score, la temperatura y la entropía.
      </div>
    );
  }

  return (
    <div>
      <MiniLineChart
        title="Score (negro vs blanco)"
        series={[
          { key: "blackScore", color: COLOR_BLACK, label: "Negro" },
          { key: "whiteScore", color: COLOR_WHITE, label: "Blanco" },
        ]}
        metricsHistory={metricsHistory}
        currentStep={currentStep}
        formatValue={(v) => v.toFixed(1)}
      />
      <MiniLineChart
        title="Temperatura (|Δ score|)"
        series={[{ key: "temperature", color: COLOR_TEMPERATURE, label: "Temp." }]}
        metricsHistory={metricsHistory}
        currentStep={currentStep}
        formatValue={(v) => v.toFixed(1)}
      />
      <MiniLineChart
        title="Entropía por jugador (bits)"
        series={[
          { key: "blackEntropy", color: COLOR_BLACK, label: "Negro" },
          { key: "whiteEntropy", color: COLOR_WHITE, label: "Blanco" },
        ]}
        metricsHistory={metricsHistory}
        currentStep={currentStep}
        formatValue={(v) => v.toFixed(2)}
      />
      <MiniLineChart
        title="Temperatura estadística — Boltzmann (β)"
        series={[{ key: "boltzmannBeta", color: COLOR_BOLTZMANN, label: "β" }]}
        metricsHistory={metricsHistory}
        currentStep={currentStep}
        formatValue={(v) => {
          const t = Math.abs(v) < 0.01 ? "∞" : (1 / v).toFixed(2);
          return `β=${v.toFixed(2)} (T=${t})`;
        }}
        caption="Temperatura de Jaynes/MaxEnt (distinta de |Δ score| arriba): β>0 = tablero más ordenado que el azar bajo el Hamiltoniano · β≈0 = sin orden detectable · β<0 = temperatura negativa (energía anómalamente alta)."
      />
    </div>
  );
}
