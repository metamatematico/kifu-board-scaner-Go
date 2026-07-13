export type BoardSize = 9 | 13 | 19;

export interface Stone {
  x: number; // Column index, 0 to size-1 (left to right)
  y: number; // Row index, 0 to size-1 (top to bottom)
  color: "black" | "white";
}

export type ToolMode = "black" | "white" | "erase" | "none";

export interface Point {
  x: number;
  y: number;
}

export interface Corners {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

export interface Group {
  color: "black" | "white";
  stones: Point[];
  liberties: Point[];
}

export interface TerritoryRegion {
  points: Point[];
  owner: "black" | "white" | "neutral";
}

export interface ScoreResult {
  blackStones: number;
  whiteStones: number;
  blackTerritory: number;
  whiteTerritory: number;
  blackScore: number;
  whiteScore: number;
  komi: number;
  result: string;
}

export type GameMove =
  | { color: "black" | "white"; pass: false; x: number; y: number }
  | { color: "black" | "white"; pass: true };

// One point of the classical spin-1 Hamiltonian energy field (see
// src/utils/hamiltonianEnergy.ts) — value is theoretically bounded to [-2, 2],
// negative = black-leaning, positive = white-leaning.
export interface EnergyPoint {
  x: number;
  y: number;
  value: number;
}

export interface MetricsStep {
  blackScore: number;
  whiteScore: number;
  temperature: number;
  // Binary Shannon entropy of each color's own board-fraction (stones+territory
  // vs everything else) — kept separate per color (not one joint 3-way value)
  // so each player has their own independent, directly comparable number.
  // A third, distinct entropy type from the two below (territorial, not
  // energy-based).
  blackEntropy: number;
  whiteEntropy: number;
  // Mean Hamiltonian energy per site (see src/utils/hamiltonianEnergy.ts).
  meanEnergy: number;
  // β: Lagrange multiplier from the Jaynes/MaxEnt derivation — derived/
  // supporting quantity, not a headline metric (see boltzmannTemperature.ts).
  boltzmannBeta: number;
  // Shannon/Gibbs entropy (nats) of the max-entropy distribution at `boltzmannBeta`
  // — the direct energy→information readout, bounded to [0, ln 3].
  gibbsEntropy: number;
  // Shannon entropy (nats) of the SPATIAL |energy| distribution across the
  // board — a second, independent entropy type (see src/utils/energyEntropy.ts).
  energyShannonEntropy: number;
}

export interface SavedGame {
  id: string;
  name: string;
  date: string;
  boardSize: BoardSize;
  stones: Stone[];
  sgf: string;
  notes?: string;
}
