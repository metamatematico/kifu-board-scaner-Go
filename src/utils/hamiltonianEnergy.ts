import { BoardSize, EnergyPoint, Stone } from "../types";

/**
 * Classical spin-1 Hamiltonian energy field, ported directly from **M1**,
 * the model developed and analyzed in the user's private repo
 * `metamatematico/Go_entropic_information` (src/go_ising_classical.py).
 *
 * M1's two-spin Hamiltonian `H(s0,s1) = h0*s0 + h1*s1 + K*s0*s1^2 + L*s0^2*s1`
 * with (h0=1, h1=2, K=-1, L=-1) is algebraically identical to the
 * `cubic_interaction` originally ported from ometitlan/Project-Quantum-Go —
 * this module keeps that one-parameter-set specialization (`cubicInteraction`
 * below) rather than re-generalizing over h0/h1/K/L, since only that fixed
 * combination has been requested here.
 *
 * What M1 adds beyond the original single-neighbor-shell port: interaction
 * over a **Manhattan-distance kernel up to a configurable radius R**, each
 * shell d (1..R) weighted by `1/d^2` (M1's own `INTERACTION_COEFFS`, exact
 * inverse-square law — its own table {1:1.0, 2:0.25, 3:0.111, 4:0.0625}
 * matches 1/d^2 to 3 decimals), and a **weighted sum** over that whole
 * kernel — not an average — with any neighbor outside the board treated as
 * empty (spin 0), never excluded. Read directly from M1's `compute_energy`
 * in go_ising_classical.py, not from memory.
 *
 * This is NOT combinatorial-game-theory temperature (see the app's other
 * "temperature" metric, a finite-difference score proxy) — it's a third,
 * distinct signal: a statistical-mechanics-style local "charge/influence"
 * field, ported faithfully from its source formula, not an approximation
 * invented for this app.
 */

export type Spin = -1 | 0 | 1;

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

function onBoard(x: number, y: number, boardSize: BoardSize): boolean {
  return x >= 0 && x < boardSize && y >= 0 && y < boardSize;
}

/**
 * All relative offsets (dx,dy) at Manhattan distance exactly d, for every d
 * from 1 to `manhattanDistance` — M1's `get_kernel_positions`. Deliberately
 * NOT filtered to on-board offsets: `spinAt` already returns 0 for any
 * position absent from the spin map, which covers both "empty but on-board"
 * and "off-board" identically — exactly M1's "outside the board = empty"
 * rule, with no separate boundary check needed.
 */
export function getKernelPositions(manhattanDistance: number): { dx: number; dy: number; d: number }[] {
  const positions: { dx: number; dy: number; d: number }[] = [];
  for (let d = 1; d <= manhattanDistance; d++) {
    for (let dx = -d; dx <= d; dx++) {
      for (let dy = -d; dy <= d; dy++) {
        if (Math.abs(dx) + Math.abs(dy) === d) positions.push({ dx, dy, d });
      }
    }
  }
  return positions;
}

/** M1's INTERACTION_COEFFS: exact 1/d^2 (its own table is this formula rounded to 3 decimals). */
export function interactionCoefficient(d: number): number {
  return 1 / (d * d);
}

export function buildSpinMap(boardSize: BoardSize, stones: Stone[]): Map<string, Spin> {
  const map = new Map<string, Spin>();
  for (const stone of stones) {
    if (!onBoard(stone.x, stone.y, boardSize)) continue;
    map.set(posKey(stone.x, stone.y), stone.color === "black" ? -1 : 1);
  }
  return map;
}

export function spinAt(spinMap: Map<string, Spin>, x: number, y: number): Spin {
  return spinMap.get(posKey(x, y)) ?? 0;
}

/** s0 + 2*s1 - s0*s1^2 - s0^2*s1 — M1's H(s0,s1) with (h0=1,h1=2,K=-1,L=-1). */
export function cubicInteraction(s0: Spin, s1: Spin): number {
  return s0 + 2 * s1 - s0 * s1 ** 2 - s0 ** 2 * s1;
}

/**
 * Energy at a single point: the 1/d^2-weighted SUM (not average) of
 * cubicInteraction between this point's spin and every neighbor in the
 * Manhattan kernel up to `manhattanDistance` — M1's `compute_energy`.
 */
function computeEnergyAt(
  spinMap: Map<string, Spin>,
  x: number,
  y: number,
  manhattanDistance: number
): number {
  const center = spinAt(spinMap, x, y);
  let total = 0;
  for (const { dx, dy, d } of getKernelPositions(manhattanDistance)) {
    const neighborSpin = spinAt(spinMap, x + dx, y + dy);
    total += interactionCoefficient(d) * cubicInteraction(center, neighborSpin);
  }
  return total;
}

/**
 * Computes the energy field for every point on the board (occupied or not),
 * at the given Manhattan kernel radius (default 1, matching M1's own
 * default).
 */
export function computeEnergyField(
  boardSize: BoardSize,
  stones: Stone[],
  manhattanDistance = 1
): EnergyPoint[] {
  const spinMap = buildSpinMap(boardSize, stones);
  const field: EnergyPoint[] = [];
  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      field.push({ x, y, value: computeEnergyAt(spinMap, x, y, manhattanDistance) });
    }
  }
  return field;
}

/**
 * Theoretical max |energy| at a given Manhattan radius R:
 * cubicInteraction is bounded to [-2,2] per neighbor pair (verified by hand
 * over all 9 spin combinations), each Manhattan shell d has exactly 4d
 * lattice points, weighted by 1/d^2 — so
 *   max|E(R)| = sum_{d=1}^{R} (4d) * (2/d^2) = 8 * sum_{d=1}^{R} (1/d)
 * (8 times the R-th harmonic number).
 *
 * NOTE this is a worst-case bound (every kernel neighbor simultaneously an
 * extreme same-signed stone) that a real, color-mixed board never
 * approaches — measured directly on a real game, actual |energy| barely
 * grows with R while this bound grows much faster. GoBoard.tsx's heatmap
 * therefore deliberately does NOT rescale by this per R (that made every R
 * look almost identical); it stays fixed at this function's own R=1 value.
 * This function is kept for anyone reasoning about the model's exact
 * mathematical range, not as the heatmap's color-scale input.
 */
export function energyMaxAbs(manhattanDistance: number): number {
  let harmonic = 0;
  for (let d = 1; d <= manhattanDistance; d++) harmonic += 1 / d;
  return 8 * harmonic;
}
