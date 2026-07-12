import { BoardSize, Stone } from "../types";
import { Spin, buildSpinMap, spinAt, orthogonalNeighbors, cubicInteraction } from "./hamiltonianEnergy";

/**
 * Statistical (Jaynes / maximum-entropy) temperature of the Hamiltonian
 * energy field defined in hamiltonianEnergy.ts — a THIRD, distinct notion of
 * "temperature" from the two already in this app: it is neither the
 * finite-difference |Δscore| proxy (MetricsStep.temperature) nor
 * combinatorial-game-theory temperature (never implemented — would require a
 * real game-tree search engine).
 *
 * The derivation (Jaynes, "Information Theory and Statistical Mechanics",
 * 1957): the Hamiltonian already defines, at every site, exactly 3 possible
 * local states — its own spin s ∈ {-1,0,1} (black/empty/white) — with its
 * neighbors held fixed at their real observed value (a standard mean-field /
 * cavity treatment). Among ALL probability distributions over those 3 states
 * per site, the Boltzmann distribution p(s) ∝ exp(-β·H(s)) is the UNIQUE one
 * that maximizes Shannon/Gibbs entropy subject to reproducing a given average
 * energy — β is exactly the Lagrange multiplier of that energy constraint,
 * i.e. the inverse temperature, an information-theoretic quantity by
 * construction, not a physics analogy bolted on afterwards.
 *
 * β is solved numerically so the Boltzmann-weighted ensemble average energy
 * matches the actually-observed board energy (the mean of computeEnergyField
 * at this position). This is well-posed, not tautological: the ensemble
 * average is a genuinely different, non-trivial function of β (see
 * ensembleAverageEnergy below), and it is monotonically non-increasing in β
 * (the standard stat-mech identity dĒ/dβ = -Var[H] ≤ 0), so a unique root
 * exists and bisection converges to it.
 */

const SPIN_STATES: Spin[] = [-1, 0, 1];
const BETA_MAX = 20; // exp(-20*2) already underflows to 0 in double precision — well past saturation

export interface BoltzmannTemperatureResult {
  /** Inverse temperature β (natural units, k_B = 1). Always finite, in [-BETA_MAX, BETA_MAX]. */
  beta: number;
  /** U(t): the actual observed mean Hamiltonian energy this β reproduces. */
  observedEnergy: number;
}

/** The 3 hypothetical local energies H_i(s) for s ∈ {-1,0,1}, neighbors fixed at their real spins. */
function localEnergyLevels(spinMap: Map<string, Spin>, boardSize: BoardSize, x: number, y: number): number[] {
  const neighbors = orthogonalNeighbors(x, y, boardSize);
  if (neighbors.length === 0) return [0, 0, 0];
  return SPIN_STATES.map((s) => {
    let sum = 0;
    for (const n of neighbors) sum += cubicInteraction(s, spinAt(spinMap, n.x, n.y));
    return sum / neighbors.length;
  });
}

/** Ē(β): Boltzmann-weighted ensemble average energy per site, averaged over all sites. */
function ensembleAverageEnergy(levelsPerSite: number[][], beta: number): number {
  let total = 0;
  for (const levels of levelsPerSite) {
    let z = 0;
    let weighted = 0;
    for (const e of levels) {
      const w = Math.exp(-beta * e);
      z += w;
      weighted += w * e;
    }
    total += weighted / z;
  }
  return total / levelsPerSite.length;
}

export function computeBoltzmannTemperature(boardSize: BoardSize, stones: Stone[]): BoltzmannTemperatureResult {
  const spinMap = buildSpinMap(boardSize, stones);

  const levelsPerSite: number[][] = [];
  let observedEnergy = 0;
  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      const levels = localEnergyLevels(spinMap, boardSize, x, y);
      levelsPerSite.push(levels);
      const actualSpin = spinAt(spinMap, x, y);
      observedEnergy += levels[SPIN_STATES.indexOf(actualSpin)];
    }
  }
  observedEnergy /= levelsPerSite.length;

  // Ē(β) is monotonically non-increasing: Ē(-BETA_MAX) is its max, Ē(+BETA_MAX)
  // its min. Clip to the bound if the observed energy is outside that range
  // (only possible if the board is already at/near its exact local
  // energy extreme), otherwise bisect for the unique root.
  let lo = -BETA_MAX;
  let hi = BETA_MAX;
  const eAtLo = ensembleAverageEnergy(levelsPerSite, lo);
  const eAtHi = ensembleAverageEnergy(levelsPerSite, hi);
  if (observedEnergy >= eAtLo) return { beta: lo, observedEnergy };
  if (observedEnergy <= eAtHi) return { beta: hi, observedEnergy };

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const eMid = ensembleAverageEnergy(levelsPerSite, mid);
    if (eMid > observedEnergy) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return { beta: (lo + hi) / 2, observedEnergy };
}
