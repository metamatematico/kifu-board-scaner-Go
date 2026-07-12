import { BoardSize, Group, Point, ScoreResult, Stone, TerritoryRegion } from "../types";

type StoneColor = "black" | "white";

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseKey(key: string): Point {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function onBoard(x: number, y: number, boardSize: BoardSize): boolean {
  return x >= 0 && x < boardSize && y >= 0 && y < boardSize;
}

function orthogonalNeighbors(x: number, y: number, boardSize: BoardSize): Point[] {
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].filter((p) => onBoard(p.x, p.y, boardSize));
}

function diagonalNeighbors(x: number, y: number, boardSize: BoardSize): Point[] {
  return [
    { x: x - 1, y: y - 1 },
    { x: x - 1, y: y + 1 },
    { x: x + 1, y: y - 1 },
    { x: x + 1, y: y + 1 },
  ].filter((p) => onBoard(p.x, p.y, boardSize));
}

/**
 * Builds a lookup of occupied points, de-duplicated and bounds-checked.
 * Every function below goes through this single choke point so stone
 * counts, liberties, and territory borders never disagree with each other
 * due to duplicate coordinates (e.g. bad SGF import) or out-of-bounds data
 * (e.g. a scan/board-size mismatch) — later entries win, invalid ones are dropped.
 */
function buildStoneMap(boardSize: BoardSize, stones: Stone[]): Map<string, StoneColor> {
  const map = new Map<string, StoneColor>();
  for (const stone of stones) {
    if (!onBoard(stone.x, stone.y, boardSize)) continue;
    map.set(posKey(stone.x, stone.y), stone.color);
  }
  return map;
}

/**
 * Finds connected chains of same-color stones (4-connectivity, no diagonals)
 * along with each group's liberties (empty orthogonal neighbor points).
 */
export function findGroups(boardSize: BoardSize, stones: Stone[]): Group[] {
  const stoneMap = buildStoneMap(boardSize, stones);
  const visited = new Set<string>();
  const groups: Group[] = [];

  for (const [startKey, startColor] of stoneMap) {
    if (visited.has(startKey)) continue;

    const stack = [startKey];
    visited.add(startKey);
    const groupStones: Point[] = [];
    const libertyKeys = new Set<string>();

    while (stack.length > 0) {
      const curKey = stack.pop()!;
      const cur = parseKey(curKey);
      groupStones.push(cur);

      for (const n of orthogonalNeighbors(cur.x, cur.y, boardSize)) {
        const nKey = posKey(n.x, n.y);
        const nColor = stoneMap.get(nKey);
        if (nColor === undefined) {
          libertyKeys.add(nKey);
        } else if (nColor === startColor && !visited.has(nKey)) {
          visited.add(nKey);
          stack.push(nKey);
        }
      }
    }

    groups.push({
      color: startColor,
      stones: groupStones,
      liberties: [...libertyKeys].map(parseKey),
    });
  }

  return groups;
}

/**
 * Finds connected empty regions (4-connectivity). A region's owner is the
 * single color bordering it everywhere; if it borders both colors (or no
 * stones at all, e.g. an empty board) it's "neutral" (dame/frontera).
 */
export function findTerritoryRegions(boardSize: BoardSize, stones: Stone[]): TerritoryRegion[] {
  const stoneMap = buildStoneMap(boardSize, stones);
  const visited = new Set<string>();
  const regions: TerritoryRegion[] = [];

  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      const startKey = posKey(x, y);
      if (stoneMap.has(startKey) || visited.has(startKey)) continue;

      const stack = [startKey];
      visited.add(startKey);
      const points: Point[] = [];
      let bordersBlack = false;
      let bordersWhite = false;

      while (stack.length > 0) {
        const curKey = stack.pop()!;
        const cur = parseKey(curKey);
        points.push(cur);

        for (const n of orthogonalNeighbors(cur.x, cur.y, boardSize)) {
          const nKey = posKey(n.x, n.y);
          const nColor = stoneMap.get(nKey);
          if (nColor === "black") bordersBlack = true;
          else if (nColor === "white") bordersWhite = true;
          else if (!visited.has(nKey)) {
            visited.add(nKey);
            stack.push(nKey);
          }
        }
      }

      const owner: TerritoryRegion["owner"] =
        bordersBlack && bordersWhite ? "neutral" : bordersBlack ? "black" : bordersWhite ? "white" : "neutral";

      regions.push({ points, owner });
    }
  }

  return regions;
}

/**
 * "Simple eye" heuristic: an empty point is an eye for color C if every
 * orthogonal neighbor is C (off-board neighbors vacuously satisfy this,
 * since they're simply absent from the neighbor list), plus a diagonal-control
 * rule sized to how many diagonals are actually on the board — corners (1
 * on-board diagonal) and edges (2) require ALL of them to be C; interior
 * points (4) tolerate one non-C diagonal (the classic "false eye" threshold).
 *
 * This is a local, single-point heuristic — it does not detect false eyes
 * created by multi-point diagonal-cutting shapes spanning several eye-space
 * points, and it does not perform true unconditional-life analysis (that
 * requires Benson's algorithm). Treat it as a fast approximation for display,
 * not a guarantee of life under all lines of play.
 */
function isSimpleEye(
  x: number,
  y: number,
  color: StoneColor,
  stoneMap: Map<string, StoneColor>,
  boardSize: BoardSize
): boolean {
  for (const n of orthogonalNeighbors(x, y, boardSize)) {
    if (stoneMap.get(posKey(n.x, n.y)) !== color) return false;
  }

  const onBoardDiagonals = diagonalNeighbors(x, y, boardSize);
  const friendlyCount = onBoardDiagonals.filter((d) => stoneMap.get(posKey(d.x, d.y)) === color).length;
  const allowedMisses = onBoardDiagonals.length === 4 ? 1 : 0;
  const requiredFriendly = onBoardDiagonals.length - allowedMisses;

  return friendlyCount >= requiredFriendly;
}

export function findEyes(boardSize: BoardSize, stones: Stone[]): { black: Point[]; white: Point[] } {
  const stoneMap = buildStoneMap(boardSize, stones);
  const black: Point[] = [];
  const white: Point[] = [];

  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      if (stoneMap.has(posKey(x, y))) continue;
      if (isSimpleEye(x, y, "black", stoneMap, boardSize)) black.push({ x, y });
      if (isSimpleEye(x, y, "white", stoneMap, boardSize)) white.push({ x, y });
    }
  }

  return { black, white };
}

function formatMargin(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

/**
 * Area (Chinese-rules) scoring: score = stones on board + surrounded territory.
 * Komi is added to White. All stones on the board are assumed alive — this
 * module does no capture simulation or legality checking; dead-stone removal
 * is the user's responsibility via the existing board editor before scoring.
 */
export function computeScore(boardSize: BoardSize, stones: Stone[], komi: number): ScoreResult {
  const stoneMap = buildStoneMap(boardSize, stones);
  let blackStones = 0;
  let whiteStones = 0;
  for (const color of stoneMap.values()) {
    if (color === "black") blackStones++;
    else whiteStones++;
  }

  const regions = findTerritoryRegions(boardSize, stones);
  let blackTerritory = 0;
  let whiteTerritory = 0;
  for (const region of regions) {
    if (region.owner === "black") blackTerritory += region.points.length;
    else if (region.owner === "white") whiteTerritory += region.points.length;
  }

  const blackScore = blackStones + blackTerritory;
  const whiteScore = whiteStones + whiteTerritory + komi;

  const diff = blackScore - whiteScore;
  const result = diff > 0 ? `B+${formatMargin(diff)}` : diff < 0 ? `W+${formatMargin(-diff)}` : "0";

  return {
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    blackScore,
    whiteScore,
    komi,
    result,
  };
}
