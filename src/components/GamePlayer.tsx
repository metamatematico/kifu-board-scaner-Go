import React, { useRef } from "react";
import { Upload, Play, Pause, SkipBack, SkipForward, X, Rewind, FastForward } from "lucide-react";

interface GamePlayerProps {
  isLoaded: boolean;
  totalMoves: number;
  currentStep: number;
  isPlaying: boolean;
  speedMs: number;
  onLoadFile: (file: File) => void;
  onPlayPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSeek: (step: number) => void;
  onSpeedChange: (ms: number) => void;
  onClose: () => void;
}

const SPEED_OPTIONS = [
  { label: "0.5x", ms: 2000 },
  { label: "1x", ms: 1000 },
  { label: "2x", ms: 500 },
  { label: "4x", ms: 250 },
];

export default function GamePlayer({
  isLoaded,
  totalMoves,
  currentStep,
  isPlaying,
  speedMs,
  onLoadFile,
  onPlayPause,
  onStepBack,
  onStepForward,
  onSeek,
  onSpeedChange,
  onClose,
}: GamePlayerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadFile(file);
    e.target.value = "";
  };

  return (
    <div className="w-full bg-slate-50 p-4 border border-slate-200 mt-6 flex flex-col gap-3 rounded-none">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
          Reproductor de Partida:
        </span>
        {isLoaded && (
          <button
            onClick={onClose}
            className="text-[9px] text-slate-400 hover:text-rose-600 uppercase tracking-wider font-bold flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Cerrar partida
          </button>
        )}
      </div>

      {!isLoaded ? (
        <>
          <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
            Carga un archivo .sgf con una partida completa para verla reproducirse jugada por jugada.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white rounded-none text-[10px] font-bold uppercase tracking-widest transition-all shadow-xs flex items-center justify-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Cargar partida (SGF)
          </button>
          <input ref={fileInputRef} type="file" accept=".sgf" className="hidden" onChange={handleFileChange} />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
            <span>
              Jugada <span className="font-bold text-slate-900">{currentStep}</span> / {totalMoves}
            </span>
            <div className="flex items-center gap-1">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.ms}
                  onClick={() => onSpeedChange(opt.ms)}
                  className={`px-1.5 py-0.5 border text-[9px] font-bold ${
                    speedMs === opt.ms
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={totalMoves}
            value={currentStep}
            onChange={(e) => onSeek(parseInt(e.target.value, 10))}
            className="w-full accent-slate-900"
          />

          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onSeek(0)}
              className="p-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700"
              title="Ir al inicio"
            >
              <Rewind className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onStepBack}
              disabled={currentStep === 0}
              className="p-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40"
              title="Jugada anterior"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onPlayPause}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-950 text-white flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? "Pausa" : "Reproducir"}
            </button>
            <button
              onClick={onStepForward}
              disabled={currentStep === totalMoves}
              className="p-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40"
              title="Jugada siguiente"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onSeek(totalMoves)}
              className="p-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700"
              title="Ir al final"
            >
              <FastForward className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
