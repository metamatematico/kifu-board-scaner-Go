import { useState } from "react";
import { Stone, BoardSize, ToolMode } from "../types";

interface GoBoardProps {
  boardSize: BoardSize;
  stones: Stone[];
  onIntersectionClick: (x: number, y: number) => void;
  toolMode: ToolMode;
}

export default function GoBoard({
  boardSize,
  stones,
  onIntersectionClick,
  toolMode,
}: GoBoardProps) {
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);

  // Traditional Go column coordinates skipping 'I'
  const getColLetter = (index: number) => {
    const letters = [
      "A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V"
    ];
    return letters[index] || "";
  };

  // Traditional Go row coordinate is 1 at the bottom and boardSize at the top
  const getRowNumber = (index: number) => {
    return boardSize - index;
  };

  // Check if a cell is a Hoshi (star point)
  const isHoshi = (x: number, y: number, size: BoardSize) => {
    if (size === 19) {
      return (x === 3 || x === 9 || x === 15) && (y === 3 || y === 9 || y === 15);
    }
    if (size === 13) {
      return (x === 3 || x === 6 || x === 9) && (y === 3 || y === 6 || y === 9);
    }
    if (size === 9) {
      return (x === 2 || x === 4 || x === 6) && (y === 2 || y === 4 || y === 6);
    }
    return false;
  };

  // Create a grid of cells for hit detection
  const gridRange = Array.from({ length: boardSize }, (_, i) => i);

  // Find a stone at (x, y)
  const findStone = (x: number, y: number) => {
    return stones.find((s) => s.x === x && s.y === y);
  };

  // Dimensions of SVG
  const margin = 40; // Space for labels
  const cellSize = 40; // Size of each grid cell
  const boardDimension = cellSize * (boardSize - 1) + margin * 2;

  // Converts coordinate indices (0 to size-1) to SVG coordinates
  const getSvgCoord = (index: number) => {
    return margin + index * cellSize;
  };

  return (
    <div className="w-full max-w-[500px] mx-auto select-none">
      {/* Container with golden board aspect ratio */}
      <div className="relative aspect-square w-full rounded-none shadow-md border border-slate-300 overflow-hidden bg-[#e6c28e]">
        {/* Visual wood texture background */}
        <div className="absolute inset-0 bg-linear-to-br from-[#eccfa2] via-[#e6c28e] to-[#dbae71] opacity-95" />
        <div 
          className="absolute inset-0 opacity-15 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]"
          style={{ mixBlendMode: "multiply" }}
        />
        <div className="absolute inset-0 border border-amber-950/20 rounded-none pointer-events-none" />

        {/* Board SVG */}
        <svg
          viewBox={`0 0 ${boardDimension} ${boardDimension}`}
          className="w-full h-full relative z-10"
        >
          {/* Definitions for 3D gradients and filters */}
          <defs>
            {/* Soft Shadow for White Stones */}
            <filter id="shadow" x="-20%" y="-20%" width="150%" height="150%">
              <feDropShadow dx="1" dy="2" stdDeviation="1.5" floodColor="#1e130c" floodOpacity="0.4" />
            </filter>
            
            {/* Soft Shadow for Black Stones */}
            <filter id="black-shadow" x="-20%" y="-20%" width="150%" height="150%">
              <feDropShadow dx="0.5" dy="1.5" stdDeviation="1.2" floodColor="#000" floodOpacity="0.55" />
            </filter>

            {/* Glossy gradient for Black Stones */}
            <radialGradient id="blackStoneGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#4a4a4a" />
              <stop offset="30%" stopColor="#2c2c2c" />
              <stop offset="85%" stopColor="#141414" />
              <stop offset="100%" stopColor="#080808" />
            </radialGradient>

            {/* Ivory radial gradient for White Stones */}
            <radialGradient id="whiteStoneGrad" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#f7f5f0" />
              <stop offset="85%" stopColor="#e3ded2" />
              <stop offset="100%" stopColor="#cbc2b3" />
            </radialGradient>
          </defs>

          {/* 1. Grid Lines */}
          <g stroke="#3a2510" strokeWidth="1" opacity="0.8" strokeLinecap="square">
            {/* Vertical Lines */}
            {gridRange.map((x) => {
              const cx = getSvgCoord(x);
              return (
                <line
                  key={`v-${x}`}
                  x1={cx}
                  y1={getSvgCoord(0)}
                  x2={cx}
                  y2={getSvgCoord(boardSize - 1)}
                />
              );
            })}

            {/* Horizontal Lines */}
            {gridRange.map((y) => {
              const cy = getSvgCoord(y);
              return (
                <line
                  key={`h-${y}`}
                  x1={getSvgCoord(0)}
                  y1={cy}
                  x2={getSvgCoord(boardSize - 1)}
                  y2={cy}
                />
              );
            })}
          </g>

          {/* 2. Star Points (Hoshi) */}
          <g fill="#3a2510">
            {gridRange.flatMap((x) =>
              gridRange
                .filter((y) => isHoshi(x, y, boardSize))
                .map((y) => (
                  <circle
                    key={`hoshi-${x}-${y}`}
                    cx={getSvgCoord(x)}
                    cy={getSvgCoord(y)}
                    r="3.5"
                  />
                ))
            )}
          </g>

          {/* 3. Coordinate Labels */}
          <g fill="#5d401b" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="600" textAnchor="middle" dominantBaseline="middle" opacity="0.85">
            {gridRange.map((i) => {
              const coord = getSvgCoord(i);
              return (
                <g key={`labels-${i}`}>
                  {/* Letters at Top (y=0 margin) */}
                  <text x={coord} y={margin / 2}>
                    {getColLetter(i)}
                  </text>
                  {/* Letters at Bottom (y=size-1 margin) */}
                  <text x={coord} y={boardDimension - margin / 2}>
                    {getColLetter(i)}
                  </text>
                  {/* Numbers at Left (x=0 margin) */}
                  <text x={margin / 2} y={coord}>
                    {getRowNumber(i)}
                  </text>
                  {/* Numbers at Right (x=size-1 margin) */}
                  <text x={boardDimension - margin / 2} y={coord}>
                    {getRowNumber(i)}
                  </text>
                </g>
              );
            })}
          </g>

          {/* 4. Hover Ghost Stone Preview */}
          {hoveredCell && toolMode !== "none" && !findStone(hoveredCell.x, hoveredCell.y) && (
            <g opacity="0.5">
              {toolMode === "black" && (
                <circle
                  cx={getSvgCoord(hoveredCell.x)}
                  cy={getSvgCoord(hoveredCell.y)}
                  r={cellSize * 0.46}
                  fill="url(#blackStoneGrad)"
                />
              )}
              {toolMode === "white" && (
                <circle
                  cx={getSvgCoord(hoveredCell.x)}
                  cy={getSvgCoord(hoveredCell.y)}
                  r={cellSize * 0.46}
                  fill="url(#whiteStoneGrad)"
                  stroke="#ccc"
                  strokeWidth="0.5"
                />
              )}
              {toolMode === "erase" && (
                <circle
                  cx={getSvgCoord(hoveredCell.x)}
                  cy={getSvgCoord(hoveredCell.y)}
                  r={cellSize * 0.4}
                  fill="transparent"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeDasharray="4,4"
                />
              )}
            </g>
          )}

          {/* 5. Real Placed Stones */}
          <g>
            {stones.map((stone, index) => {
              const cx = getSvgCoord(stone.x);
              const cy = getSvgCoord(stone.y);
              const isBlack = stone.color === "black";

              return (
                <g key={`stone-${stone.x}-${stone.y}-${index}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={cellSize * 0.47}
                    fill={isBlack ? "url(#blackStoneGrad)" : "url(#whiteStoneGrad)"}
                    filter={isBlack ? "url(#black-shadow)" : "url(#shadow)"}
                    className="cursor-pointer transition-transform hover:scale-105 duration-100"
                    onClick={() => onIntersectionClick(stone.x, stone.y)}
                  />
                  {/* Highlight indicator if hover in erase mode */}
                  {hoveredCell && hoveredCell.x === stone.x && hoveredCell.y === stone.y && toolMode === "erase" && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={cellSize * 0.47}
                      fill="rgba(239, 68, 68, 0.3)"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* 6. Mouse hit-detection zones (invisible grid) */}
          <g fill="transparent" className="cursor-pointer">
            {gridRange.map((x) =>
              gridRange.map((y) => {
                const cx = getSvgCoord(x);
                const cy = getSvgCoord(y);
                return (
                  <rect
                    key={`hit-${x}-${y}`}
                    x={cx - cellSize / 2}
                    y={cy - cellSize / 2}
                    width={cellSize}
                    height={cellSize}
                    onMouseEnter={() => setHoveredCell({ x, y })}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => onIntersectionClick(x, y)}
                  />
                );
              })
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}
