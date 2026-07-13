import { EnergyPoint } from "../types";

/**
 * Shannon entropy of the SPATIAL distribution of |energy| across the board —
 * ported directly from `S_shannon` in the user's private repo
 * (metamatematico/Go_entropic_information, src/go_entropy.py):
 *
 *   p_i = |E_i| / Σ_j |E_j|      (over every cell of the board)
 *   S   = -Σ_i p_i ln p_i        (nats)
 *
 * This is a DIFFERENT entropy from gibbsEntropy in boltzmannTemperature.ts:
 * that one measures how uncertain/ordered each SITE's local 3-state
 * distribution is (via Jaynes MaxEnt); this one measures how CONCENTRATED
 * vs. SPREAD the energy is across the board's cells — 0 when all the energy
 * sits in a single cell, ln(N) when it is spread perfectly evenly across N
 * nonzero cells. Bounded to [0, ln(N)] where N = number of cells with
 * nonzero energy.
 */
export function energyShannonEntropy(energyField: EnergyPoint[]): number {
  const absValues = energyField.map((p) => Math.abs(p.value));
  const total = absValues.reduce((sum, v) => sum + v, 0);
  if (total < 1e-12) return 0;

  let entropy = 0;
  for (const v of absValues) {
    const p = v / total;
    if (p > 1e-12) entropy -= p * Math.log(p);
  }
  return entropy;
}
