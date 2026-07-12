import { Stone, BoardSize, GameMove } from "../types";

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

/**
 * Thrown by parseSgfGame on genuinely malformed SGF — unlike parseSgf (which
 * never throws), a full game-tree parse has many more ways to be structurally
 * invalid, and silently guessing would desync move order from the recorded
 * game. Callers should show err.message directly; it's already descriptive.
 */
export class SgfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SgfParseError";
  }
}

type Token =
  | { type: "LPAREN" | "RPAREN" | "SEMI" }
  | { type: "IDENT"; value: string }
  | { type: "VALUE"; value: string };

function tokenizeSgf(sgf: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = sgf.length;

  const isWhitespace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";
  const isAsciiLetter = (c: string) => /[A-Za-z]/.test(c);

  while (i < n) {
    const c = sgf[i];

    if (isWhitespace(c)) {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "LPAREN" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "RPAREN" });
      i++;
      continue;
    }
    if (c === ";") {
      tokens.push({ type: "SEMI" });
      i++;
      continue;
    }
    if (isAsciiLetter(c)) {
      const start = i;
      while (i < n && isAsciiLetter(sgf[i])) i++;
      tokens.push({ type: "IDENT", value: sgf.slice(start, i) });
      continue;
    }
    if (c === "[") {
      i++;
      const chars: string[] = [];
      let closed = false;
      while (i < n) {
        if (sgf[i] === "\\" && i + 1 < n) {
          chars.push(sgf[i + 1]);
          i += 2;
          continue;
        }
        if (sgf[i] === "]") {
          i++;
          closed = true;
          break;
        }
        chars.push(sgf[i]);
        i++;
      }
      if (!closed) {
        throw new SgfParseError(`SGF inválido: falta ']' que cierre un valor de propiedad.`);
      }
      tokens.push({ type: "VALUE", value: chars.join("") });
      continue;
    }
    // Stray character outside a bracket (BOM, junk) — harmless, skip.
    i++;
  }

  return tokens;
}

interface SgfNode {
  props: Map<string, string[]>;
}

interface SgfGameTree {
  nodes: SgfNode[];
  children: SgfGameTree[];
}

class SgfParser {
  private tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private advance(): Token {
    const t = this.tokens[this.index];
    this.index++;
    return t;
  }

  parseCollection(): SgfGameTree[] {
    const trees: SgfGameTree[] = [];
    while (this.peek() !== undefined) {
      trees.push(this.parseGameTree());
    }
    if (trees.length === 0) {
      throw new SgfParseError("SGF inválido: no se encontró ningún árbol de juego (se esperaba '(').");
    }
    return trees;
  }

  private parseGameTree(): SgfGameTree {
    const open = this.peek();
    if (!open || open.type !== "LPAREN") {
      throw new SgfParseError(`SGF inválido: se esperaba '(' y se encontró ${open?.type ?? "el final del archivo"}.`);
    }
    this.advance();
    const nodes = this.parseSequence();
    const children: SgfGameTree[] = [];
    while (this.peek()?.type === "LPAREN") {
      children.push(this.parseGameTree());
    }
    const close = this.peek();
    if (!close || close.type !== "RPAREN") {
      throw new SgfParseError("SGF inválido: paréntesis sin cerrar (falta ')').");
    }
    this.advance();
    return { nodes, children };
  }

  private parseSequence(): SgfNode[] {
    const nodes: SgfNode[] = [];
    while (this.peek()?.type === "SEMI") {
      nodes.push(this.parseNode());
    }
    if (nodes.length === 0) {
      throw new SgfParseError("SGF inválido: un árbol de juego no tiene ningún nodo (se esperaba ';').");
    }
    return nodes;
  }

  private parseNode(): SgfNode {
    this.advance(); // consume SEMI
    const props = new Map<string, string[]>();
    while (this.peek()?.type === "IDENT") {
      const identTok = this.advance() as { type: "IDENT"; value: string };
      const ident = identTok.value.toUpperCase();
      const values: string[] = [];
      while (this.peek()?.type === "VALUE") {
        values.push((this.advance() as { type: "VALUE"; value: string }).value);
      }
      if (values.length === 0) {
        throw new SgfParseError(`SGF inválido: la propiedad ${ident} no tiene ningún valor.`);
      }
      if (props.has(ident)) {
        props.get(ident)!.push(...values);
      } else {
        props.set(ident, values);
      }
    }
    return { props };
  }
}

function decodeSgfCoord(v: string, boardSize: BoardSize): { x: number; y: number } {
  if (v.length !== 2) {
    throw new SgfParseError(`SGF inválido: coordenada "[${v}]" debe tener exactamente 2 caracteres.`);
  }
  const decode = (ch: string): number => {
    if (ch >= "a" && ch <= "z") return ch.charCodeAt(0) - "a".charCodeAt(0);
    throw new SgfParseError(`SGF inválido: carácter de coordenada '${ch}' no soportado (solo a-s minúsculas).`);
  };
  const x = decode(v[0]);
  const y = decode(v[1]);
  if (x >= boardSize || y >= boardSize) {
    throw new SgfParseError(`SGF inválido: coordenada [${v}] está fuera del tablero de ${boardSize}x${boardSize}.`);
  }
  return { x, y };
}

/**
 * Parses a full SGF game tree (unlike parseSgf, which flattens/dedupes
 * everything into a static final position, discarding move order). Follows
 * the MAIN LINE only — at every branch point, only the first child game tree
 * is walked; sibling variations are never visited, so they can't corrupt the
 * main sequence. Handles passes (B[]/W[]), tolerates and ignores unrelated
 * properties (PW, PB, KM, C, etc.), and never mistakes bracketed text (e.g.
 * inside a comment) for structural syntax, unlike the old regex-only parser.
 *
 * Only lowercase a-s coordinates are supported (matches this app's BoardSize
 * ceiling of 19x19 — no need for FF4's uppercase A-Z extension for bigger
 * boards). AE (remove-stone) and non-root SZ are intentionally not handled;
 * both are rare in real files and silently ignored rather than causing a
 * crash. Throws SgfParseError on genuinely malformed input.
 */
export function parseSgfGame(sgf: string): { boardSize: BoardSize; setup: Stone[]; moves: GameMove[] } {
  const tokens = tokenizeSgf(sgf);
  const parser = new SgfParser(tokens);
  const trees = parser.parseCollection();
  const root = trees[0];

  let boardSize: BoardSize = 19;
  let sizeLocked = false;
  const setup: Stone[] = [];
  const moves: GameMove[] = [];

  let currentTree: SgfGameTree | undefined = root;
  while (currentTree) {
    for (const node of currentTree.nodes) {
      const props = node.props;

      if (!sizeLocked) {
        sizeLocked = true;
        const sz = props.get("SZ")?.[0];
        if (sz !== undefined) {
          const n = parseInt(sz, 10);
          if (n !== 9 && n !== 13 && n !== 19) {
            throw new SgfParseError(`Tamaño de tablero no soportado SZ[${sz}] — solo 9, 13 o 19.`);
          }
          boardSize = n;
        }
      }

      for (const v of props.get("AB") ?? []) {
        if (v === "") continue;
        const { x, y } = decodeSgfCoord(v, boardSize);
        setup.push({ x, y, color: "black" });
      }
      for (const v of props.get("AW") ?? []) {
        if (v === "") continue;
        const { x, y } = decodeSgfCoord(v, boardSize);
        setup.push({ x, y, color: "white" });
      }

      const bVals = props.get("B");
      const wVals = props.get("W");
      if (bVals && wVals) {
        throw new SgfParseError("SGF inválido: un nodo tiene propiedades B y W a la vez.");
      }
      if (bVals) {
        const v = bVals[0];
        moves.push(v === "" ? { color: "black", pass: true } : { color: "black", pass: false, ...decodeSgfCoord(v, boardSize) });
      }
      if (wVals) {
        const v = wVals[0];
        moves.push(v === "" ? { color: "white", pass: true } : { color: "white", pass: false, ...decodeSgfCoord(v, boardSize) });
      }
    }

    currentTree = currentTree.children[0];
  }

  return { boardSize, setup, moves };
}
