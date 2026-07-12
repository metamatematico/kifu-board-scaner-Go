import React, { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, ScanLine } from "lucide-react";
import { BoardSize, Corners, Point, Stone } from "../types";
import { detectCorners } from "../lib/cornerDetection";
import { rectifyBoard, canvasToJpegBase64 } from "../lib/perspectiveWarp";
import { detectStonesClassically } from "../lib/stoneDetection";
import { loadImage } from "../lib/loadImage";

interface CornerAdjusterProps {
  imageDataUrl: string;
  boardSize: BoardSize;
  onConfirm: (previewDataUrl: string, stones: Stone[]) => void;
  onCancel: () => void;
}

type CornerKey = keyof Corners;
type Status = "detecting" | "auto" | "fallback";

const CORNER_KEYS: CornerKey[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

export default function CornerAdjuster({ imageDataUrl, boardSize, onConfirm, onCancel }: CornerAdjusterProps) {
  // Offscreen, never-rendered image used for all OpenCV work (detection + warp) —
  // see loadImage.ts for why this must be separate from the visible <img> below.
  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [corners, setCorners] = useState<Corners | null>(null);
  const [status, setStatus] = useState<Status>("detecting");
  const [draggingKey, setDraggingKey] = useState<CornerKey | null>(null);
  const [isWarping, setIsWarping] = useState(false);
  const [warpError, setWarpError] = useState<string | null>(null);

  const runDetection = async () => {
    const img = sourceImgRef.current;
    if (!img) return;
    setStatus("detecting");
    const result = await detectCorners(img);
    setCorners(result.corners);
    setStatus(result.autoDetected ? "auto" : "fallback");
  };

  useEffect(() => {
    let cancelled = false;
    loadImage(imageDataUrl).then((img) => {
      if (cancelled) return;
      sourceImgRef.current = img;
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      void runDetection();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUrl]);

  const clientToImagePoint = (clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg || !naturalSize) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const transformed = pt.matrixTransform(ctm.inverse());
    return {
      x: Math.min(Math.max(transformed.x, 0), naturalSize.width),
      y: Math.min(Math.max(transformed.y, 0), naturalSize.height),
    };
  };

  const handlePointerDownOnCorner = (key: CornerKey) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingKey(key);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingKey) return;
    const point = clientToImagePoint(e.clientX, e.clientY);
    if (!point) return;
    setCorners((prev) => (prev ? { ...prev, [draggingKey]: point } : prev));
  };

  const handlePointerUp = () => setDraggingKey(null);

  const handleConfirm = async () => {
    const img = sourceImgRef.current;
    if (!img || !corners) return;
    setIsWarping(true);
    setWarpError(null);
    try {
      const rectifiedCanvas = await rectifyBoard(img, corners);
      const stones = detectStonesClassically(rectifiedCanvas, boardSize);
      const previewDataUrl = `data:image/jpeg;base64,${canvasToJpegBase64(rectifiedCanvas)}`;
      onConfirm(previewDataUrl, stones);
    } catch (err: any) {
      setWarpError(err.message || "No se pudo procesar la imagen.");
    } finally {
      setIsWarping(false);
    }
  };

  const handleSize = naturalSize ? Math.max(naturalSize.width, naturalSize.height) * 0.018 : 0;
  const strokeSize = naturalSize ? Math.max(naturalSize.width, naturalSize.height) * 0.004 : 0;

  return (
    <div className="aspect-square w-full rounded-none bg-slate-950 relative border border-slate-800 overflow-hidden flex flex-col">
      {/*
        img and svg are stacked as siblings, both `absolute inset-0 w-full h-full`
        against this (definite-size, flexbox-computed) container. Both independently
        letterbox to the same source aspect ratio (img via object-contain, svg via its
        default preserveAspectRatio), so their visible content areas coincide exactly —
        this avoids the classic inline-block-with-auto-height circular sizing bug.
      */}
      <div className="flex-1 relative p-2 min-h-0">
        <img
          src={imageDataUrl}
          alt="Tablero capturado"
          className="absolute inset-0 w-full h-full object-contain select-none"
          draggable={false}
        />
        {naturalSize && corners && (
          <svg
            ref={svgRef}
            data-testid="corner-adjuster-overlay"
            viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
            className="absolute inset-0 w-full h-full"
            style={{ touchAction: "none" }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <polygon
              points={CORNER_KEYS.map((k) => `${corners[k].x},${corners[k].y}`).join(" ")}
              fill="rgba(56,189,248,0.15)"
              stroke="#38bdf8"
              strokeWidth={strokeSize}
            />
            {CORNER_KEYS.map((key) => (
              <circle
                key={key}
                cx={corners[key].x}
                cy={corners[key].y}
                r={handleSize}
                fill="#38bdf8"
                stroke="#0f172a"
                strokeWidth={strokeSize * 0.5}
                className="cursor-grab active:cursor-grabbing"
                onPointerDown={handlePointerDownOnCorner(key)}
              />
            ))}
          </svg>
        )}

        {status === "detecting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
            <div className="flex flex-col items-center text-sky-400">
              <RefreshCw className="w-6 h-6 animate-spin mb-2" />
              <span className="text-[10px] font-mono uppercase tracking-widest">Detectando esquinas...</span>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 text-center border-t border-slate-800">
        <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
          {status === "auto" && "Esquinas detectadas automáticamente — ajusta si es necesario"}
          {status === "fallback" && "No se detectó el tablero automáticamente — ajusta las esquinas manualmente"}
          {status === "detecting" && "Analizando imagen..."}
        </p>
        <p className="text-[9px] font-mono text-slate-500 mt-1 leading-relaxed">
          Alinea cada esquina con la intersección extrema de la cuadrícula (no con el borde de madera del tablero) — de eso depende la precisión de la detección de piedras.
        </p>
        {warpError && <p className="text-[10px] font-mono text-rose-400 mt-1">{warpError}</p>}
      </div>

      <div className="flex justify-center gap-3 px-4 py-3 border-t border-slate-800 bg-slate-900">
        <button
          onClick={onCancel}
          disabled={isWarping}
          className="px-4 py-2 bg-slate-800/90 hover:bg-slate-800 text-white rounded-none text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={() => void runDetection()}
          disabled={status === "detecting" || isWarping}
          className="px-4 py-2 bg-slate-800/90 hover:bg-slate-800 text-white rounded-none text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <ScanLine className="w-3.5 h-3.5" />
          Re-detectar
        </button>
        <button
          onClick={() => void handleConfirm()}
          disabled={status === "detecting" || isWarping || !corners}
          className="px-6 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-none text-[10px] font-bold uppercase tracking-wider shadow-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          {isWarping ? "Procesando..." : "Confirmar y Escanear"}
        </button>
      </div>
    </div>
  );
}
