import React, { useState } from "react";
import { History, Trash2, FolderOpen, Save, FileSpreadsheet, PlusCircle, ChevronUp, ChevronDown } from "lucide-react";
import { SavedGame } from "../types";

interface SavedGamesProps {
  savedGames: SavedGame[];
  onLoadGame: (game: SavedGame) => void;
  onDeleteGame: (id: string) => void;
  onSaveCurrentGame: (name: string, notes?: string) => void;
  hasStones: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function SavedGames({
  savedGames,
  onLoadGame,
  onDeleteGame,
  onSaveCurrentGame,
  hasStones,
  collapsed = false,
  onToggleCollapse,
}: SavedGamesProps) {
  const [newGameName, setNewGameName] = useState("");
  const [newGameNotes, setNewGameNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameName.trim()) return;
    onSaveCurrentGame(newGameName.trim(), newGameNotes.trim());
    setNewGameName("");
    setNewGameNotes("");
    setIsSaving(false);
  };

  // Helper to get stone count breakdown
  const getStoneBreakdown = (game: SavedGame) => {
    const b = game.stones.filter((s) => s.color === "black").length;
    const w = game.stones.filter((s) => s.color === "white").length;
    return `Negras: ${b}, Blancas: ${w}`;
  };

  return (
    <div className="bg-white rounded-none p-6 border border-slate-200 shadow-xs flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-900" />
          Library (Historial)
        </h2>
        
        <div className="flex items-center gap-2">
          {hasStones && !isSaving && !collapsed && (
            <button
              onClick={() => setIsSaving(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-950 text-white rounded-none text-[10px] uppercase tracking-wider font-bold transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Guardar Tablero
            </button>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 bg-white hover:bg-slate-100 text-slate-500 rounded-none transition-colors border border-slate-200"
              title={collapsed ? "Expandir" : "Colapsar"}
            >
              {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Save Game Form */}
      {!collapsed && isSaving && (
        <form onSubmit={handleSave} className="bg-slate-50 p-4 border border-slate-200 rounded-none flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wider">Guardar Estado del Tablero</h3>
          
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1 font-mono">Nombre de la partida / problema</label>
            <input
              required
              type="text"
              value={newGameName}
              onChange={(e) => setNewGameName(e.target.value)}
              placeholder="Ej: Problema de Vida y Muerte #12"
              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 focus:border-slate-400 rounded-none focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1 font-mono">Notas u observaciones (Opcional)</label>
            <input
              type="text"
              value={newGameNotes}
              onChange={(e) => setNewGameNotes(e.target.value)}
              placeholder="Ej: Negro juega y vive"
              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 focus:border-slate-400 rounded-none focus:outline-hidden"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setIsSaving(false)}
              className="px-3.5 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-none text-[10px] uppercase tracking-wider font-bold transition-colors bg-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-950 text-white rounded-none text-[10px] uppercase tracking-wider font-bold transition-colors flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar
            </button>
          </div>
        </form>
      )}

      {/* Games List */}
      {!collapsed && (savedGames.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-none bg-slate-50 border border-slate-200 flex items-center justify-center mb-3 text-slate-400">
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-700">LIBRARY_EMPTY</p>
          <p className="text-[10px] text-slate-400 max-w-[210px] mt-1 leading-normal font-mono">
            Digitaliza un tablero con la IA o coloca piedras, luego guárdalo aquí.
          </p>
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 flex flex-col pr-1 font-mono">
          {savedGames.map((game) => (
            <div key={game.id} className="py-3 flex items-start justify-between gap-3 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-slate-900 truncate" title={game.name}>
                    {game.name}
                  </h4>
                  <span className="text-[9px] bg-slate-900 text-white px-1 py-0.5 rounded-none font-bold shrink-0">
                    {game.boardSize}x{game.boardSize}
                  </span>
                </div>
                {game.notes && (
                  <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5 italic">
                    {game.notes}
                  </p>
                )}
                <p className="text-[9px] text-slate-400 mt-1 flex items-center gap-1">
                  <span>{getStoneBreakdown(game)}</span>
                  <span>•</span>
                  <span>{new Date(game.date).toLocaleDateString()}</span>
                </p>
              </div>

              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => onLoadGame(game)}
                  className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-none transition-all"
                  title="Cargar tablero"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDeleteGame(game.id)}
                  className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-none transition-all"
                  title="Eliminar partida"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
