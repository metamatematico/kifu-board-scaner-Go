import { BoardSize, EnergyPoint, Stone } from "../types";

/**
 * Classical spin-1 Hamiltonian energy field, ported directly from the
 * "cubic" positional map in ometitlan/Project-Quantum-Go
 * (src/go_isings_models.py, PositionalMapModel + cubic_interaction /
 * ClassicalIsingModel). That repo documents this classical closed form as
 * exactly matching the expectation value of its quantum Hamiltonian
 * (quantum_classical_parity in the same file) for a static (non-time-evolved)
 * board — this port only carries over that classical/static half; the
 * PennyLane quantum-circuit simulation is not portable to TypeScript and is
 * out of scope here.
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

// Manhattan-distance-1 ring = the 4 orthogonal neighbors — the same
// adjacency Go itself uses, and the only radius this port implements
// (the source repo's default; larger radii are a straightforward but
// unrequested extension of the same loop).
export function orthogonalNeighbors(x: number, y: number, boardSize: BoardSize) {
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].filter((p) => onBoard(p.x, p.y, boardSize));
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

/** s0 + 2*s1 - s0*s1^2 - s0^2*s1 — verbatim from cubic_interaction in the source repo. */
export function cubicInteraction(s0: Spin, s1: Spin): number {
  return s0 + 2 * s1 - s0 * s1 ** 2 - s0 ** 2 * s1;
}

/**
 * Energy at a single point: the average cubic_interaction between this
 * point's spin and each of its in-board orthogonal neighbors' spins.
 * Out-of-board neighbors are simply excluded from the average (matching the
 * source's boundary handling), not treated as empty/zero — a point on the
 * edge of the board is averaged over fewer neighbors, not diluted by
 * fictitious ones.
 */
function computeEnergyAt(spinMap: Map<string, Spin>, boardSize: BoardSize, x: number, y: number): number {
  const center = spinAt(spinMap, x, y);
  const neighbors = orthogonalNeighbors(x, y, boardSize);
  if (neighbors.length === 0) return 0;
  let sum = 0;
  for (const n of neighbors) {
    sum += cubicInteraction(center, spinAt(spinMap, n.x, n.y));
  }
  return sum / neighbors.length;
}

/**
 * Computes the energy field for every point on the board (occupied or not).
 * Theoretically bounded to [-2, 2] (verified by hand over all 9 spin
 * combinations of cubic_interaction) — callers can rely on that fixed range
 * for a color scale instead of rescaling per board/frame.
 */
export function computeEnergyField(boardSize: BoardSize, stones: Stone[]): EnergyPoint[] {
  const spinMap = buildSpinMap(boardSize, stones);
  const field: EnergyPoint[] = [];
  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      field.push({ x, y, value: computeEnergyAt(spinMap, boardSize, x, y) });
    }
  }
  return field;
}
