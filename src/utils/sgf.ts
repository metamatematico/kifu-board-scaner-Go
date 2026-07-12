import { Stone, BoardSize } from "../types";

/**
 * Converts a list of stones and board size to standard SGF format.
 */
export function stonesToSgf(boardSize: BoardSize, stones: Stone[]): string {
  const blackCoords = stones
    .filter((s) => s.color === "black")
    .map((s) => {
      const col = String.fromCharCode(97 + s.x);
      const row = String.fromCharCode(97 + s.y);
      return `[${col}${row}]`;
    })
    .join("");

  const whiteCoords = stones
    .filter((s) => s.color === "white")
    .map((s) => {
      const col = String.fromCharCode(97 + s.x);
      const row = String.fromCharCode(97 + s.y);
      return `[${col}${row}]`;
    })
    .join("");

  return `(;GM[1]FF[4]CA[UTF-8]AP[KifuBoardScanner]SZ[${boardSize}]${
    blackCoords ? "AB" + blackCoords : ""
  }${whiteCoords ? "AW" + whiteCoords : ""})`;
}

/**
 * Parses a simple SGF string back to a list of stones and board size.
 */
export function parseSgf(sgf: string): { boardSize: BoardSize; stones: Stone[] } {
  let boardSize: BoardSize = 19;
  const stonesMap = new Map<string, "black" | "white">();

  // Clean SGF string
  const cleanSgf = sgf.trim();

  // Parse board size: SZ[19], SZ[13], SZ[9]
  const sizeMatch = cleanSgf.match(/SZ\[(9|13|19)\]/i);
  if (sizeMatch) {
    boardSize = parseInt(sizeMatch[1], 10) as BoardSize;
  }

  // Helper to extract coordinates inside brackets of a certain property
  // e.g. AB[pd][dp] or AW[cc]
  const extractPlacements = (propName: string, color: "black" | "white") => {
    // This regex looks for propName followed by coordinate brackets, e.g. AB[ab][cd]
    // SGF properties can also be separate, like AB[ab]AB[cd] or AB[ab][cd]
    // Let's find all occurrences of AB or AW and parse the brackets following them.
    const regex = new RegExp(`${propName}(?:\\[([a-s]{2})\\])+`, "gi");
    let match;
    while ((match = regex.exec(cleanSgf)) !== null) {
      const fullMatch = match[0];
      // Extract all brackets in this match
      const bracketsRegex = /\[([a-s]{2})\]/g;
      let bracketMatch;
      while ((bracketMatch = bracketsRegex.exec(fullMatch)) !== null) {
        const coords = bracketMatch[1].toLowerCase();
        stonesMap.set(coords, color);
      }
    }
  };

  extractPlacements("AB", "black");
  extractPlacements("AW", "white");

  // Also extract single moves: B[pd], W[dp] as placements (fallbacks)
  const moveRegex = /(B|W)\[([a-s]{2})\]/gi;
  let moveMatch;
  while ((moveMatch = moveRegex.exec(cleanSgf)) !== null) {
    const color = moveMatch[1].toUpperCase() === "B" ? "black" : "white";
    const coords = moveMatch[2].toLowerCase();
    // Only set if not already set by AB/AW setup properties
    if (!stonesMap.has(coords)) {
      stonesMap.set(coords, color);
    }
  }

  // Convert map to Stone array
  const stones: Stone[] = [];
  stonesMap.forEach((color, coords) => {
    if (coords.length === 2) {
      const x = coords.charCodeAt(0) - 97;
      const y = coords.charCodeAt(1) - 97;
      // Ensure coordinates are within valid board bounds
      if (x >= 0 && x < boardSize && y >= 0 && y < boardSize) {
        stones.push({ x, y, color });
      }
    }
  });

  return { boardSize, stones };
}
