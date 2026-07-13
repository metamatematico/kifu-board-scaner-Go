import { BoardSize, Stone } from "../types";
import { Spin, buildSpinMap, spinAt, getKernelPositions, interactionCoefficient, cubicInteraction } from "./hamiltonianEnergy";

/**
 * Energy → information, via Jaynes' maximum-entropy principle (Jaynes,
 * "Information Theory and Statistical Mechanics", 1957), applied to the
 * Hamiltonian energy field defined in hamiltonianEnergy.ts.
 *
 * The Hamiltonian already defines, at every site, exactly 3 possible local
 * states — its own spin s ∈ {-1,0,1} (black/empty/white) — with its
 * neighbors held fixed at their real observed value (a standard mean-field /
 * cavity treatment). Among ALL probability distributions over those 3 states
 * per site, the Boltzmann distribution p(s) ∝ exp(-β·H(s)) is the UNIQUE one
 * that maximizes Shannon/Gibbs entropy subject to reproducing a given average
 * energy. β (the Lagrange multiplier enforcing that constraint) is solved
 * numerically first — the same well-posed, non-tautological bisection as
 * before (Ē(β) is a genuinely different function of β than the observed
 * energy itself; monotone by the standard identity dĒ/dβ = -Var[H] ≤ 0) —
 * but β is only the intermediate step now, not the headline result.
 *
 * The headline result is `gibbsEntropy`: the Shannon/Gibbs entropy S = -Σ
 * p(s)ln p(s) of that same maximum-entropy distribution, computed at the
 * solved β via the standard thermodynamic identity S = ln Z + β⟨E⟩ — a
 * direct, exact byproduct of the β search, not a new approximation. This is
 * the actual energy→information relationship: the observed energy pins down
 * β via Jaynes, and β pins down how much information (entropy) that
 * distribution carries. Bounded to [0, ln 3] (3 possible states per site):
 * ln 3 at β=0 (uniform — maximally uninformative), 0 as |β|→∞ (deterministic
 * — fully informative/ordered).
 */

const SPIN_STATES: Spin[] = [-1, 0, 1];
const BETA_MAX = 20; // exp(-20*2) already underflows to 0 in double precision — well past saturation

export interface BoltzmannTemperatureResult {
  /** Inverse temperature β (natural units, k_B = 1) — intermediate/derived, not the headline metric. Always finite, in [-BETA_MAX, BETA_MAX]. */
  beta: number;
  /** U(t): the actual observed mean Hamiltonian energy this β reproduces. */
  observedEnergy: number;
  /** S = ln Z + β⟨E⟩, averaged per site (nats). The Shannon/Gibbs entropy of the max-entropy distribution at `beta`. Bounded to [0, ln 3]. */
  gibbsEntropy: number;
}

/**
 * The 3 hypothetical local energies H_i(s) for s ∈ {-1,0,1}, using the same
 * 1/d²-weighted Manhattan kernel (up to `manhattanDistance`) as
 * hamiltonianEnergy.ts's computeEnergyAt — a weighted SUM over the kernel,
 * neighbors fixed at their real observed spins, off-board treated as empty.
 */
function localEnergyLevels(spinMap: Map<string, Spin>, x: number, y: number, manhattanDistance: number): number[] {
  const kernel = getKernelPositions(manhattanDistance);
  return SPIN_STATES.map((s) => {
    let total = 0;
    for (const { dx, dy, d } of kernel) {
      total += interactionCoefficient(d) * cubicInteraction(s, spinAt(spinMap, x + dx, y + dy));
    }
    return total;
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

/**
 * S = ln Z + β⟨E⟩, averaged per site — the Shannon/Gibbs entropy of the
 * Boltzmann distribution at `beta`, an exact thermodynamic identity (not an
 * approximation): S = -Σp(s)ln p(s), and substituting p(s)=exp(-βE(s))/Z
 * gives -Σp(s)[-βE(s) - ln Z] = β⟨E⟩ + ln Z directly.
 */
function gibbsEntropyAt(levelsPerSite: number[][], beta: number): number {
  let total = 0;
  for (const levels of levelsPerSite) {
    let z = 0;
    let weighted = 0;
    for (const e of levels) {
      const w = Math.exp(-beta * e);
      z += w;
      weighted += w * e;
    }
    const meanE = weighted / z;
    total += Math.log(z) + beta * meanE;
  }
  return total / levelsPerSite.length;
}

export function computeBoltzmannTemperature(
  boardSize: BoardSize,
  stones: Stone[],
  manhattanDistance = 1
): BoltzmannTemperatureResult {
  const spinMap = buildSpinMap(boardSize, stones);

  const levelsPerSite: number[][] = [];
  let observedEnergy = 0;
  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      const levels = localEnergyLevels(spinMap, x, y, manhattanDistance);
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
  if (observedEnergy >= eAtLo) {
    return { beta: lo, observedEnergy, gibbsEntropy: gibbsEntropyAt(levelsPerSite, lo) };
  }
  if (observedEnergy <= eAtHi) {
    return { beta: hi, observedEnergy, gibbsEntropy: gibbsEntropyAt(levelsPerSite, hi) };
  }

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const eMid = ensembleAverageEnergy(levelsPerSite, mid);
    if (eMid > observedEnergy) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const beta = (lo + hi) / 2;
  return { beta, observedEnergy, gibbsEntropy: gibbsEntropyAt(levelsPerSite, beta) };
}
