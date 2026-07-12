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

export interface SavedGame {
  id: string;
  name: string;
  date: string;
  boardSize: BoardSize;
  stones: Stone[];
  sgf: string;
  notes?: string;
}
