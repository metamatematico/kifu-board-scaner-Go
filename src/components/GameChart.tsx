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
const COLOR_GIBBS = "#8b5cf6"; // violet-500 — entropy of the max-entropy distribution at β (validated via dataviz's palette script)
const COLOR_ENERGY_SPATIAL = "#059669"; // emerald-600 — spatial entropy of the energy field (validated: distinct from the other 4)
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
  formatValue: (v: number, row?: MetricsStep) => string;
  caption?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const totalSteps = metricsHistory.length - 1;
  const domainSource =
    metricsHistory.length > SKIP_MOVES_FOR_SCALE * 3 ? metricsHistory.slice(SKIP_MOVES_FOR_SCALE) : metricsHistory;
  const allValues = domainSource.flatMap((m) => series.map((s) => m[s.key] as number));
  // Zoom to the actual observed range (+10% padding) instead of always forcing
  // 0 into the domain — a metric that only ever moves within, say, [1.05,1.10]
  // (Gibbs entropy on a mild game) rendered flat at the top of a [0,1.10] axis;
  // subtle real movement was invisible.
  //
  // The span floor must be a tiny ABSOLUTE epsilon, not proportional to the
  // value's own magnitude — an earlier version used `Math.abs(rawMax)*0.05`
  // meaning to protect a perfectly-flat series from collapsing to zero
  // height, but for a series with a large baseline and a genuinely small
  // real range (Gibbs entropy: baseline ~1.1, real range ~0.0015), that
  // "5% of the value" floor was itself ~35x bigger than the real variation —
  // it silently ate the entire chart, leaving only ~6 of 48 usable pixels
  // for the actual signal. Measured directly on a real game before fixing.
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const span = Math.max(rawMax - rawMin, 1e-9);
  const pad = span * 0.1;
  const minY = rawMin - pad;
  const maxY = rawMax + pad;

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
        {/* Hairline baseline — only meaningful (and only drawn) when 0 actually
            falls inside the zoomed domain; a floor at 0 for a series that
            never approaches it (e.g. Gibbs entropy near ln 3) would just be a
            stray line at the very bottom, not an anchor. */}
        {minY <= 0 && maxY >= 0 && (
          <line x1={PAD_X} y1={yScale(0)} x2={WIDTH - PAD_X} y2={yScale(0)} stroke={COLOR_GRID} strokeWidth={1} />
        )}

        {series.map((s) => {
          const values = revealed.map((m) => m[s.key] as number);
          const path = buildPath(values, xScale, yScale);
          const lastVal = values[values.length - 1];
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
              {values.length > 0 && (
                <circle cx={xScale(values.length - 1)} cy={yScale(lastVal)} r={2.5} fill={s.color} stroke="#1a1a1a" strokeWidth={1.5} />
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
            #{hoverIndex}:{" "}
            {series
              .map((s) => `${s.label} ${formatValue(revealed[hoverIndex][s.key] as number, revealed[hoverIndex])}`)
              .join(" · ")}
          </span>
        ) : (
          <span>
            {series
              .map(
                (s) =>
                  `${s.label} ${formatValue(
                    (revealed[revealed.length - 1]?.[s.key] as number) ?? 0,
                    revealed[revealed.length - 1]
                  )}`
              )
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
        Carga una partida para ver la evolución del score, la energía y la entropía.
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
        caption="Score por área (piedras + territorio) en cada jugada, calculado por goAnalysis.ts; blanco incluye el komi. Es el resultado si la partida terminara justo en ese punto, no una predicción del resultado final."
      />
      <MiniLineChart
        title="Temperatura (|Δ score|)"
        series={[{ key: "temperature", color: COLOR_TEMPERATURE, label: "Temp." }]}
        metricsHistory={metricsHistory}
        currentStep={currentStep}
        formatValue={(v) => v.toFixed(1)}
        caption="Magnitud del cambio de score entre una jugada y la anterior — un pico marca una jugada que movió mucho el marcador. Es un proxy simple por diferencia finita, NO temperatura de teoría de juegos combinatoria (CGT, que requeriría un motor de búsqueda de variaciones) ni la entropía de Gibbs de abajo."
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
        caption="Entropía binaria de Shannon de la fracción del tablero (piedras+territorio) que controla cada color, calculada por separado — 0 bits = totalmente decidido, 1 bit = repartido 50/50. Entropía TERRITORIAL: no usa el Hamiltoniano de energía, distinta de las dos entropías de abajo."
      />
      <MiniLineChart
        title="Entropía de Gibbs (información, vía β de Jaynes)"
        series={[{ key: "gibbsEntropy", color: COLOR_GIBBS, label: "S" }]}
        metricsHistory={metricsHistory}
        currentStep={currentStep}
        formatValue={(v, row) => `S=${v.toFixed(3)} nats (β=${(row?.boltzmannBeta ?? 0).toFixed(2)})`}
        caption='Fórmula: S = ln Z + β⟨E⟩ (nats), con β resuelto por Jaynes/MaxEnt para que la distribución de Boltzmann de 3 estados por sitio (negro/vacío/blanco) reproduzca la energía media observada del Hamiltoniano M1. Rango fijo [0, ln 3]≈[0, 1.10]: 0 = tablero totalmente ordenado, ln(3) = sin orden detectable (equivale a elegir cada sitio al azar). β se muestra entre paréntesis como dato de apoyo, no es el titular. Graficada contra la energía en "Relación energía ↔ información" más abajo.'
      />
      <MiniLineChart
        title="Entropía de la energía (espacial, Shannon)"
        series={[{ key: "energyShannonEntropy", color: COLOR_ENERGY_SPATIAL, label: "S" }]}
        metricsHistory={metricsHistory}
        currentStep={currentStep}
        formatValue={(v) => `S=${v.toFixed(2)} nats`}
        caption="Fórmula: p_i=|E_i|/Σ|E_j| sobre las celdas del tablero, S=-Σp_i ln(p_i) (nats) — puerto directo de S_shannon en go_entropy.py. Rango [0, ln N] con N = celdas con energía no nula (para 19x19, hasta ln(361)≈5.89): 0 = toda la energía en una sola celda, más alto = más repartida por el tablero. Mide DÓNDE está la energía en el espacio, no cuánto orden hay por sitio (eso es la entropía de Gibbs de arriba) — sube con el número de piedras, no con qué tan decidida está la partida."
      />
      <EnergyEntropyRelation metricsHistory={metricsHistory} currentStep={currentStep} />
    </div>
  );
}

const REL_SIZE = 280;
const REL_PAD = 24;

/**
 * Energía → información: la relación empírica entre la energía media
 * observada y la entropía de Gibbs que esa energía determina vía Jaynes —
 * cada jugada es un punto (energía, entropía); la línea traza la trayectoria
 * en ese espacio a medida que avanza la partida. Un solo hue (continuidad
 * temporal, no identidad categórica), opacidad creciente hacia la jugada
 * actual — mismo patrón "revealed" que las gráficas de arriba.
 */
function EnergyEntropyRelation({ metricsHistory, currentStep }: { metricsHistory: MetricsStep[]; currentStep: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const revealed = metricsHistory.slice(0, currentStep + 1);

  const domainSource =
    metricsHistory.length > SKIP_MOVES_FOR_SCALE * 3 ? metricsHistory.slice(SKIP_MOVES_FOR_SCALE) : metricsHistory;
  const energies = domainSource.map((m) => m.meanEnergy);
  const entropies = domainSource.map((m) => m.gibbsEntropy);
  // Zoom to the actual observed range on both axes (+10% padding), same fix
  // as MiniLineChart — forcing 0 (energy) and ln(2) (entropy) into the domain
  // flattened real trajectories that stay within a narrow band (e.g. Gibbs
  // entropy hovering near ln(3) all game). Floor is a tiny absolute epsilon,
  // NOT proportional to the value's magnitude — see the note in MiniLineChart
  // above the identical bug this had (a %-of-value floor ate the entire
  // chart for a series with a large baseline and small real range).
  const zoomedDomain = (values: number[]): [number, number] => {
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = Math.max(hi - lo, 1e-9);
    const pad = span * 0.1;
    return [lo - pad, hi + pad];
  };
  const xScale = useMemo(() => scaleLinear(zoomedDomain(energies), [REL_PAD, REL_SIZE - REL_PAD]), [energies]);
  const yScale = useMemo(() => scaleLinear(zoomedDomain(entropies), [REL_SIZE - REL_PAD, REL_PAD]), [entropies]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * REL_SIZE;
    const my = ((e.clientY - rect.top) / rect.height) * REL_SIZE;
    let best = 0;
    let bestDist = Infinity;
    revealed.forEach((m, i) => {
      const d = Math.hypot(xScale(m.meanEnergy) - mx, yScale(m.gibbsEntropy) - my);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHoverIndex(best);
  };

  const path = revealed
    .map((m, i) => `${i === 0 ? "M" : "L"}${xScale(m.meanEnergy).toFixed(1)},${yScale(m.gibbsEntropy).toFixed(1)}`)
    .join(" ");

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono font-bold">
          Relación energía ↔ información
        </span>
      </div>
      <svg
        viewBox={`0 0 ${REL_SIZE} ${REL_SIZE}`}
        className="w-full"
        style={{ height: REL_SIZE * 0.62 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <line x1={REL_PAD} y1={REL_SIZE - REL_PAD} x2={REL_SIZE - REL_PAD} y2={REL_SIZE - REL_PAD} stroke={COLOR_GRID} strokeWidth={1} />
        <line x1={REL_PAD} y1={REL_PAD} x2={REL_PAD} y2={REL_SIZE - REL_PAD} stroke={COLOR_GRID} strokeWidth={1} />
        <text x={REL_SIZE / 2} y={REL_SIZE - 4} textAnchor="middle" fontSize={7} fill="#52514e" fontFamily="monospace">
          energía media (E)
        </text>
        <text
          x={8}
          y={REL_SIZE / 2}
          textAnchor="middle"
          fontSize={7}
          fill="#52514e"
          fontFamily="monospace"
          transform={`rotate(-90, 8, ${REL_SIZE / 2})`}
        >
          entropía de Gibbs (S)
        </text>

        <path d={path} fill="none" stroke={COLOR_GIBBS} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
        {revealed.map((m, i) => (
          <circle
            key={i}
            cx={xScale(m.meanEnergy)}
            cy={yScale(m.gibbsEntropy)}
            r={i === revealed.length - 1 ? 3.5 : 2}
            fill={COLOR_GIBBS}
            opacity={i === revealed.length - 1 ? 1 : 0.25 + 0.55 * (i / Math.max(1, revealed.length - 1))}
            stroke={i === revealed.length - 1 ? "#1a1a1a" : "none"}
            strokeWidth={i === revealed.length - 1 ? 2 : 0}
          />
        ))}
      </svg>
      <div className="flex justify-between text-[8px] font-mono text-slate-500 mt-0.5">
        <span>cada punto = una jugada</span>
        {hoverIndex !== null && revealed[hoverIndex] ? (
          <span className="text-slate-300">
            #{hoverIndex}: E={revealed[hoverIndex].meanEnergy.toFixed(2)} · S={revealed[hoverIndex].gibbsEntropy.toFixed(3)}
          </span>
        ) : (
          <span>
            {revealed.length > 0 &&
              `E=${revealed[revealed.length - 1].meanEnergy.toFixed(2)} · S=${revealed[revealed.length - 1].gibbsEntropy.toFixed(3)}`}
          </span>
        )}
      </div>
      <div className="text-[8px] text-slate-500 font-mono mt-1 leading-snug">
        Trayectoria de la partida en el espacio energía-entropía: eje X = energía media observada (E, gráfica "media |E|" del tablero), eje Y = entropía de Gibbs (S) que esa E determina vía Jaynes/MaxEnt — la MISMA S de la gráfica de arriba, aquí graficada contra E en vez de contra el número de jugada. Responde directamente a la pregunta "¿cómo se relaciona la energía con la información?": la línea ES esa relación, medida jugada a jugada, no supuesta.
      </div>
    </div>
  );
}
