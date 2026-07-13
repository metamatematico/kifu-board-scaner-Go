import React, { useState } from "react";
import { Copy, Check, Download, FileJson, ArrowRight, ChevronUp, ChevronDown } from "lucide-react";

interface SgfPanelProps {
  sgf: string;
  onImportSgf: (sgf: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function SgfPanel({ sgf, onImportSgf, collapsed = false, onToggleCollapse }: SgfPanelProps) {
  const [copied, setCopied] = useState(false);
  const [pastedSgf, setPastedSgf] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sgf);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy SGF:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([sgf], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    // Generate a nice default name with timestamp
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `kifu-snap-${dateStr}.sgf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedSgf.trim()) return;
    onImportSgf(pastedSgf);
    setPastedSgf("");
    setIsImportOpen(false);
  };

  return (
    <div className="bg-[#1e1e1e] rounded-none p-6 border border-slate-800 shadow-sm flex flex-col gap-4 text-white">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <FileJson className="w-4 h-4 text-slate-400" />
          JSON Response / SGF Output
        </h2>
        <div className="flex gap-2">
          {!collapsed && (
            <button
              onClick={() => setIsImportOpen(!isImportOpen)}
              className="text-[10px] uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-2.5 py-1 rounded-none transition-colors border border-slate-700"
            >
              {isImportOpen ? "Ver SGF" : "Importar"}
            </button>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-none transition-colors border border-slate-700"
              title={collapsed ? "Expandir" : "Colapsar"}
            >
              {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {collapsed ? null : !isImportOpen ? (
        <>
          {/* SGF Code Output box */}
          <div className="relative">
            <textarea
              readOnly
              value={sgf}
              className="w-full h-28 bg-black/50 border border-slate-800 rounded-none p-3.5 font-mono text-[11px] text-teal-400 focus:outline-hidden resize-none leading-relaxed"
            />
            <div className="absolute top-2 right-2 flex gap-1.5">
              <button
                onClick={handleCopy}
                className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-none shadow-xs transition-colors text-slate-400 hover:text-white"
                title="Copiar SGF"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-none text-[10px] uppercase tracking-wider transition-all border border-slate-700"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copiar SGF
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-none text-[10px] uppercase tracking-wider transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar SGF
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={handleImportSubmit} className="flex flex-col gap-3">
          <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
            Pega el contenido SGF para cargarlo en el tablero. Detectaremos el tamaño del tablero y las posiciones automáticamente.
          </p>
          <textarea
            required
            value={pastedSgf}
            onChange={(e) => setPastedSgf(e.target.value)}
            placeholder="(;GM[1]FF[4]SZ[19]AB[dd][pd]AW[dp]...)"
            className="w-full h-28 bg-black/50 border border-slate-800 focus:border-slate-600 rounded-none p-3 font-mono text-[11px] text-teal-400 focus:outline-hidden resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setIsImportOpen(false)}
              className="px-3.5 py-1.5 border border-slate-800 text-slate-400 hover:bg-slate-800 rounded-none text-[10px] uppercase tracking-wider font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-900 rounded-none text-[10px] uppercase tracking-widest font-bold transition-colors flex items-center gap-1"
            >
              Cargar SGF
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
