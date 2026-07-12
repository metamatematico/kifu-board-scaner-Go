import { BoardSize, GameMove, Stone } from "../types";
import { findGroups } from "./goAnalysis";

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

// An explicit type predicate, rather than a plain `if (move.pass) return`
// guard: this project's tsconfig doesn't enable strictNullChecks, and without
// it TS's control-flow narrowing doesn't reliably eliminate discriminated
// union members (confirmed — a plain guard here left `move` typed as the
// full GameMove union on the other side). A type predicate sidesteps that.
function isPlacement(move: GameMove): move is Extract<GameMove, { pass: false }> {
  return !move.pass;
}

/**
 * Applies one recorded move to a position, including captures: places the
 * stone, removes any opponent group left with zero liberties, then — only
 * after that — checks whether the just-played stone's own group has zero
 * liberties (suicide), removing it too if so. That order matters: resolving
 * opponent captures first is what makes a legal capturing move (which can
 * fill what would otherwise be your own last liberty) work correctly.
 *
 * This replays a presumably-legal recorded game, not a legality-enforcing
 * engine — an already-occupied target point means the SGF/move sequence is
 * corrupt or desynced, so this throws (with the move's coordinates) rather
 * than silently overwriting or skipping, so a bad file fails loudly at the
 * exact move that's broken instead of producing a nonsensical board later.
 */
export function applyMove(boardSize: BoardSize, stones: Stone[], move: GameMove): Stone[] {
  if (!isPlacement(move)) return stones;
  const { x, y, color } = move;

  if (stones.some((s) => s.x === x && s.y === y)) {
    throw new Error(`Jugada ilegal: el punto (${x},${y}) ya está ocupado.`);
  }

  let next = [...stones, { x, y, color }];
  const opponent = color === "black" ? "white" : "black";

  const groups = findGroups(boardSize, next);
  const capturedKeys = new Set<string>();
  for (const g of groups) {
    if (g.color === opponent && g.liberties.length === 0) {
      for (const s of g.stones) capturedKeys.add(posKey(s.x, s.y));
    }
  }
  if (capturedKeys.size > 0) {
    next = next.filter((s) => !capturedKeys.has(posKey(s.x, s.y)));
  }

  const groupsAfterCapture = findGroups(boardSize, next);
  const playedGroup = groupsAfterCapture.find((g) => g.stones.some((s) => s.x === x && s.y === y));
  if (playedGroup && playedGroup.liberties.length === 0) {
    const suicideKeys = new Set(playedGroup.stones.map((s) => posKey(s.x, s.y)));
    next = next.filter((s) => !suicideKeys.has(posKey(s.x, s.y)));
  }

  return next;
}

/**
 * Applies every move once, eagerly, when a game is loaded — cheap even for a
 * full 19x19 game (~400 moves x 2 flood-fills over <=361 cells, well under a
 * millisecond in practice) and gives O(1) random-access to any position for
 * a playback scrubber/chart, unlike lazy/incremental recomputation (which
 * would need either an undo model — captures aren't trivially invertible —
 * or full replay-from-start on every seek).
 *
 * Returns one entry per move PLUS the initial setup-only position at index 0,
 * so `history[i]` is "the board after move i has been played" for i >= 1.
 */
export function precomputeGameHistory(boardSize: BoardSize, setup: Stone[], moves: GameMove[]): Stone[][] {
  const history: Stone[][] = [setup];
  let current = setup;
  for (let i = 0; i < moves.length; i++) {
    try {
      current = applyMove(boardSize, current, moves[i]);
    } catch (err: any) {
      const move = moves[i];
      const desc = isPlacement(move) ? `(${move.x},${move.y})` : "pase";
      throw new Error(`Fallo al aplicar la jugada #${i + 1} (${move.color} ${desc}): ${err.message}`);
    }
    history.push(current);
  }
  return history;
}
