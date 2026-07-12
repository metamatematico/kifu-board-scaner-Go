import { useState, useEffect, useMemo } from "react";
import { 
  Camera, 
  Trash2, 
  RotateCcw, 
  HelpCircle, 
  FileCheck, 
  Sparkles,
  Layers,
  CircleDot,
  Grid3X3,
  Undo
} from "lucide-react";
import GoBoard from "./components/GoBoard";
import BoardScanner from "./components/BoardScanner";
import SgfPanel from "./components/SgfPanel";
import SavedGames from "./components/SavedGames";
import GamePlayer from "./components/GamePlayer";
import GameChart from "./components/GameChart";
import { BoardSize, Stone, ToolMode, SavedGame, MetricsStep } from "./types";
import { stonesToSgf, parseSgf, parseSgfGame } from "./utils/sgf";
import { findGroups, findTerritoryRegions, findEyes, computeScore } from "./utils/goAnalysis";
import { precomputeGameHistory } from "./utils/sgfPlayback";
import { computeEnergyField } from "./utils/hamiltonianEnergy";
import { computeBoltzmannTemperature } from "./utils/boltzmannTemperature";

export default function App() {
  const [boardSize, setBoardSize] = useState<BoardSize>(19);
  const [stones, setStones] = useState<Stone[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>("black");
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [scannedImagePreview, setScannedImagePreview] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [komi, setKomi] = useState<number>(6.5);
  const [showTerritory, setShowTerritory] = useState<boolean>(true);
  const [showEnergy, setShowEnergy] = useState<boolean>(false);

  // Game playback (SGF move-sequence replay)
  const [gameHistory, setGameHistory] = useState<Stone[][] | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);

  const groups = useMemo(() => findGroups(boardSize, stones), [boardSize, stones]);
  const territoryRegions = useMemo(() => findTerritoryRegions(boardSize, stones), [boardSize, stones]);
  const eyes = useMemo(() => findEyes(boardSize, stones), [boardSize, stones]);
  const score = useMemo(() => computeScore(boardSize, stones, komi), [boardSize, stones, komi]);
  const atariGroups = useMemo(() => groups.filter((g) => g.liberties.length === 1), [groups]);
  const territoryOverlay = useMemo(
    () =>
      territoryRegions
        .filter((r) => r.owner !== "neutral")
        .flatMap((r) => r.points.map((p) => ({ x: p.x, y: p.y, owner: r.owner as "black" | "white" }))),
    [territoryRegions]
  );

  // Classical spin-1 Hamiltonian energy field (ported from Project-Quantum-Go's
  // "cubic" positional map, see src/utils/hamiltonianEnergy.ts). Recomputes
  // automatically on every playback step since it depends on `stones`, which
  // the playback sync effect below already keeps in lockstep with `currentStep`.
  const energyField = useMemo(() => computeEnergyField(boardSize, stones), [boardSize, stones]);

  // Score/temperature/entropy for every precomputed position in the loaded game.
  // Separated from `gameHistory` on purpose: changing komi only needs to redo
  // this (cheap — reuses computeScore) rather than re-simulate every capture.
  const metricsHistory = useMemo<MetricsStep[]>(() => {
    if (!gameHistory) return [];
    const n2 = boardSize * boardSize;
    let prevDiff = 0;
    // Binary Shannon entropy of a single fraction p (vs "everything else") —
    // 0 bits at p=0 or p=1 (fully decided), 1 bit at p=0.5 (maximally split).
    const binaryEntropy = (p: number) => (p <= 0 || p >= 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p));

    return gameHistory.map((positionStones, i) => {
      const s = computeScore(boardSize, positionStones, komi);
      const diff = s.blackScore - s.whiteScore;
      const temperature = i === 0 ? 0 : Math.abs(diff - prevDiff);
      prevDiff = diff;

      const pBlack = s.blackScore / n2;
      const pWhite = (s.whiteStones + s.whiteTerritory) / n2;

      const { beta, observedEnergy } = computeBoltzmannTemperature(boardSize, positionStones);

      return {
        blackScore: s.blackScore,
        whiteScore: s.whiteScore,
        temperature,
        blackEntropy: binaryEntropy(pBlack),
        whiteEntropy: binaryEntropy(pWhite),
        boltzmannBeta: beta,
        boltzmannEnergy: observedEnergy,
      };
    });
  }, [gameHistory, boardSize, komi]);

  // Drive the visible board from the current playback step whenever a game is loaded.
  useEffect(() => {
    if (gameHistory) {
      setStones(gameHistory[currentStep]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameHistory, currentStep]);

  // Playback timer — re-armed each tick rather than a single setInterval, so
  // speed changes and reaching the end are picked up cleanly without stale closures.
  useEffect(() => {
    if (!isPlaying || !gameHistory) return;
    if (currentStep >= gameHistory.length - 1) {
      setIsPlaying(false);
      return;
    }
    const id = setTimeout(() => setCurrentStep((s) => s + 1), playbackSpeed);
    return () => clearTimeout(id);
  }, [isPlaying, currentStep, gameHistory, playbackSpeed]);

  // Load saved games from LocalStorage on mount
  useEffect(() => {
    const localData = localStorage.getItem("kifu_saved_games");
    if (localData) {
      try {
        setSavedGames(JSON.parse(localData));
      } catch (err) {
        console.error("Error loading saved games:", err);
      }
    }
  }, []);

  // Sync saved games to LocalStorage
  const saveToLocalStorage = (updatedGames: SavedGame[]) => {
    localStorage.setItem("kifu_saved_games", JSON.stringify(updatedGames));
    setSavedGames(updatedGames);
  };

  // Helper to show temporary notifications
  const showToast = (text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Click handler for board intersections
  const handleIntersectionClick = (x: number, y: number) => {
    if (gameHistory) return; // read-only while a game is loaded for playback

    const existingIndex = stones.findIndex((s) => s.x === x && s.y === y);

    if (toolMode === "erase") {
      if (existingIndex !== -1) {
        setStones(stones.filter((_, idx) => idx !== existingIndex));
      }
      return;
    }

    if (toolMode === "black" || toolMode === "white") {
      const color = toolMode;
      if (existingIndex !== -1) {
        const existingStone = stones[existingIndex];
        if (existingStone.color === color) {
          // If clicked with same color, remove it (standard double click clear action)
          setStones(stones.filter((_, idx) => idx !== existingIndex));
        } else {
          // Change color
          const updated = [...stones];
          updated[existingIndex] = { x, y, color };
          setStones(updated);
        }
      } else {
        // Add new stone
        setStones([...stones, { x, y, color }]);
      }
    }
  };

  // Clear current board
  const handleClearBoard = () => {
    if (window.confirm("¿Estás seguro de que deseas vaciar el tablero actual? Perderás los cambios no guardados.")) {
      setStones([]);
      setScannedImagePreview(null);
      showToast("Tablero despejado");
    }
  };

  // Change board size
  const handleSizeChange = (newSize: BoardSize) => {
    if (stones.length > 0) {
      if (
        !window.confirm(
          `Al cambiar al tamaño ${newSize}x${newSize}, se eliminarán las piedras actuales. ¿Deseas continuar?`
        )
      ) {
        return;
      }
    }
    setBoardSize(newSize);
    setStones([]);
    setScannedImagePreview(null);
    showToast(`Tablero cambiado a ${newSize}x${newSize}`);
  };

  // Handler for successful AI image scan
  const handleScanSuccess = (scannedSize: BoardSize, scannedStones: Stone[], imageUrl?: string) => {
    setBoardSize(scannedSize);
    setStones(scannedStones);
    if (imageUrl) {
      setScannedImagePreview(imageUrl);
    }
    showToast(`¡Escaneo exitoso! Detectadas ${scannedStones.length} piedras en tablero ${scannedSize}x${scannedSize}.`, "success");
  };

  // Handler for AI image scan errors
  const handleScanError = (errMsg: string) => {
    showToast(errMsg, "error");
  };

  // Import board from raw SGF
  const handleImportSgf = (sgfString: string) => {
    try {
      const parsed = parseSgf(sgfString);
      setBoardSize(parsed.boardSize);
      setStones(parsed.stones);
      setScannedImagePreview(null);
      showToast(`SGF cargado exitosamente (${parsed.stones.length} piedras)`);
    } catch (err) {
      showToast("Error al procesar el SGF. Asegúrate de que tenga un formato válido.", "error");
    }
  };

  // Load a full SGF game file for move-by-move playback
  const handleLoadGameFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseSgfGame(text);
      const history = precomputeGameHistory(parsed.boardSize, parsed.setup, parsed.moves);
      setBoardSize(parsed.boardSize);
      setGameHistory(history);
      setCurrentStep(0);
      setIsPlaying(false);
      setScannedImagePreview(null);
      showToast(`Partida cargada: ${parsed.moves.length} jugadas`);
    } catch (err: any) {
      showToast(err.message || "Error al cargar el archivo SGF.", "error");
    }
  };

  const handleCloseGame = () => {
    setGameHistory(null);
    setIsPlaying(false);
    setCurrentStep(0);
  };

  // Save current board as a game to local library
  const handleSaveGame = (name: string, notes?: string) => {
    const sgfStr = stonesToSgf(boardSize, stones);
    const newGame: SavedGame = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      notes,
      date: new Date().toISOString(),
      boardSize,
      stones,
      sgf: sgfStr,
    };

    const updated = [newGame, ...savedGames];
    saveToLocalStorage(updated);
    showToast(`Partida "${name}" guardada con éxito`);
  };

  // Load a game from saved games
  const handleLoadGame = (game: SavedGame) => {
    setBoardSize(game.boardSize);
    setStones(game.stones);
    setScannedImagePreview(null);
    showToast(`Cargada partida: ${game.name}`);
  };

  // Delete a saved game
  const handleDeleteGame = (id: string) => {
    const gameToDelete = savedGames.find((g) => g.id === id);
    if (
      gameToDelete &&
      window.confirm(`¿Estás seguro de que deseas eliminar la partida "${gameToDelete.name}" de tu historial?`)
    ) {
      const filtered = savedGames.filter((g) => g.id !== id);
      saveToLocalStorage(filtered);
      showToast("Partida eliminada");
    }
  };

  // Auto-generate SGF string for current board
  const currentSgf = stonesToSgf(boardSize, stones);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col antialiased">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-5 right-5 z-50 animate-[bounce_0.2s_ease-out] flex shadow-md rounded-none border border-slate-900 overflow-hidden max-w-sm">
          <div className={`w-1.5 ${notification.type === "success" ? "bg-slate-900" : "bg-rose-600"}`} />
          <div className="bg-white px-4 py-3 text-slate-950 text-xs font-mono font-bold flex items-center gap-2">
            <span>{notification.type === "success" ? "● STATUS_SUCCESS" : "▲ STATUS_ERROR"}</span>
            <span>-</span>
            <span className="font-sans font-medium text-slate-700">{notification.text}</span>
          </div>
        </div>
      )}

      {/* Geometric Balance Header */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-900 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white rounded-full"></div>
          </div>
          <span className="text-lg font-extrabold tracking-tight text-slate-900 uppercase">
            KifuSnap <span className="font-mono text-slate-400 text-xs tracking-normal font-normal lowercase pl-1">api v2.4</span>
          </span>
        </div>
        <div className="hidden md:flex gap-8 text-[11px] font-bold uppercase tracking-widest text-slate-500">
          <span className="text-slate-900 border-b-2 border-slate-900 pb-1">Endpoint Tester</span>
          <span>Documentation</span>
          <span>SDK Library</span>
          <span>Cloud Console</span>
        </div>
      </nav>

      {/* Main Workspace Grid */}
      <main className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-px bg-slate-200">
        
        {/* COLUMN 1: INPUT ANALYSIS (Board Scanner) */}
        <section className="col-span-1 lg:col-span-4 bg-white p-6 flex flex-col gap-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Source Input</h2>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold font-mono rounded-none">
              {stones.length > 0 ? "IMAGE_LOADED" : "AWAITING_INPUT"}
            </span>
          </div>

          <BoardScanner
            boardSize={boardSize}
            onScanSuccess={handleScanSuccess}
            onScanError={handleScanError}
          />

          {/* Sorter metrics for Gemini scanner feedback */}
          <div className="space-y-4 pt-4 border-t border-slate-100 font-mono text-xs text-slate-600">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500 italic">Perspective Correction</span>
              <span className="font-bold text-slate-900 uppercase">Applied</span>
            </div>
            <div className="flex justify-between text-[11px] pt-2">
              <span className="text-slate-500 italic">Stone Detection</span>
              <span className="font-bold text-slate-900 uppercase">Active</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 border border-slate-200 flex flex-col bg-slate-50">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Black Stones (N)</span>
                <span className="text-2xl font-light text-slate-950 mt-1">
                  {stones.filter((s) => s.color === "black").length}
                </span>
              </div>
              <div className="p-3 border border-slate-200 flex flex-col bg-slate-50">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">White Stones (B)</span>
                <span className="text-2xl font-light text-slate-950 mt-1">
                  {stones.filter((s) => s.color === "white").length}
                </span>
              </div>
            </div>
          </div>

          {/* Original Image Preview Box (Shown only after a successful scan) */}
          {scannedImagePreview && (
            <div className="bg-slate-50 p-4 border border-slate-200 flex flex-col gap-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1 font-mono">
                  <FileCheck className="w-3.5 h-3.5 text-slate-900" />
                  ORIGINAL_IMAGE_PREVIEW
                </span>
                <button
                  onClick={() => setScannedImagePreview(null)}
                  className="text-[9px] text-slate-400 hover:text-slate-900 uppercase tracking-wider font-bold"
                >
                  Ocultar
                </button>
              </div>
              <div className="aspect-square w-full rounded-none overflow-hidden border border-slate-200 bg-slate-950 shadow-inner relative">
                <img
                  src={scannedImagePreview}
                  alt="Tablero escaneado"
                  className="w-full h-full object-cover grayscale opacity-90"
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                <span className="absolute bottom-2.5 left-2.5 text-[9px] text-white font-mono bg-black/60 px-2 py-0.5 rounded-none tracking-widest uppercase">
                  Processed POV
                </span>
              </div>
            </div>
          )}
        </section>

        {/* COLUMN 2: GEOMETRIC RECONSTRUCTION (Go Board Editor) */}
        <section className="col-span-1 lg:col-span-5 bg-white p-6 flex flex-col items-center">
          <div className="w-full flex justify-between items-center mb-6 border-b border-slate-100 pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Grid Reconstruction</h2>
            
            {/* Board size selector */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTerritory}
                  onChange={(e) => setShowTerritory(e.target.checked)}
                  className="accent-slate-900"
                />
                Mostrar territorio
              </label>
              <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEnergy}
                  onChange={(e) => setShowEnergy(e.target.checked)}
                  className="accent-slate-900"
                />
                Mostrar energía (Hamiltoniano)
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono mr-1">Size:</span>
                {( [9, 13, 19] as BoardSize[] ).map((size) => (
                  <button
                    key={size}
                    onClick={() => handleSizeChange(size)}
                    className={`px-2.5 py-1 text-[10px] font-mono font-bold transition-all border ${
                      boardSize === size
                        ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {size}x{size}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Energy field legend — color is never the only signal, per the app's
              existing chart convention (see GameChart.tsx) */}
          {showEnergy && (
            <div className="w-full flex items-center justify-center gap-2 text-[9px] font-mono text-slate-400 uppercase tracking-widest -mb-1">
              <span>Negro</span>
              <div
                className="h-2 w-32 rounded-none border border-slate-200"
                style={{
                  background: "linear-gradient(to right, rgba(56,189,248,0.55), rgba(56,189,248,0) 50%, rgba(251,113,133,0) 50%, rgba(251,113,133,0.55))",
                }}
              />
              <span>Blanco</span>
              <span className="text-slate-300 normal-case">— energía (Hamiltoniano clásico spin-1)</span>
            </div>
          )}

          {/* The Go Board Visualization */}
          <div className="w-full flex justify-center py-4">
            <GoBoard
              boardSize={boardSize}
              stones={stones}
              onIntersectionClick={handleIntersectionClick}
              toolMode={toolMode}
              territoryOverlay={showTerritory ? territoryOverlay : undefined}
              energyOverlay={showEnergy ? energyField : undefined}
            />
          </div>

          {/* Real score computed by src/utils/goAnalysis.ts (area/Chinese scoring) */}
          <div className="mt-6 grid grid-cols-3 w-full gap-4 text-center font-mono border-t border-slate-100 pt-6 shrink-0">
            <div>
               <div className="text-xl font-bold text-slate-900 leading-none">{boardSize}x{boardSize}</div>
               <div className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">Board Size</div>
            </div>
            <div className="border-x border-slate-100">
               <input
                 type="number"
                 step="0.5"
                 value={komi}
                 onChange={(e) => setKomi(parseFloat(e.target.value) || 0)}
                 className="w-16 text-xl font-bold text-blue-600 leading-none text-center bg-transparent border-b border-dashed border-blue-200 focus:outline-none focus:border-blue-500"
               />
               <div className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">Komi</div>
            </div>
            <div>
               <div className="text-xl font-bold text-slate-900 leading-none">{score.result}</div>
               <div className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">Score (área)</div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="w-full bg-slate-50 p-4 border border-slate-200 mt-6 rounded-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block mb-3">Score Breakdown:</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Negro (piedras+territorio)</span>
                <span className="font-bold text-slate-900">
                  {score.blackStones}+{score.blackTerritory}={score.blackScore}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Blanco (piedras+territorio+komi)</span>
                <span className="font-bold text-slate-900">
                  {score.whiteStones}+{score.whiteTerritory}+{score.komi}={score.whiteScore}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Grupos (N/B)</span>
                <span className="font-bold text-slate-900">
                  {groups.filter((g) => g.color === "black").length}/{groups.filter((g) => g.color === "white").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ojos (N/B)</span>
                <span className="font-bold text-slate-900">{eyes.black.length}/{eyes.white.length}</span>
              </div>
              {atariGroups.length > 0 && (
                <div className="flex justify-between col-span-2 text-rose-600">
                  <span>⚠ Grupos en atari</span>
                  <span className="font-bold">{atariGroups.length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Game playback (SGF move-sequence replay) */}
          <GamePlayer
            isLoaded={gameHistory !== null}
            totalMoves={gameHistory ? gameHistory.length - 1 : 0}
            currentStep={currentStep}
            isPlaying={isPlaying}
            speedMs={playbackSpeed}
            onLoadFile={handleLoadGameFile}
            onPlayPause={() => setIsPlaying((p) => !p)}
            onStepBack={() => setCurrentStep((s) => Math.max(0, s - 1))}
            onStepForward={() =>
              setCurrentStep((s) => Math.min((gameHistory?.length ?? 1) - 1, s + 1))
            }
            onSeek={(step) => setCurrentStep(step)}
            onSpeedChange={setPlaybackSpeed}
            onClose={handleCloseGame}
          />

          {/* Professional Tool Chest (hidden while a game is loaded for playback — read-only then) */}
          {!gameHistory && (
          <div className="w-full bg-slate-50 p-4 border border-slate-200 mt-6 flex flex-col gap-3 rounded-none">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Editor Tools:</span>
              <div className="text-[9px] text-slate-400 font-mono">
                Piedras: <span className="font-bold text-slate-800">{stones.length}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setToolMode("black")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider border transition-all ${
                  toolMode === "black"
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-slate-950 border border-slate-800" />
                Negra
              </button>

              <button
                onClick={() => setToolMode("white")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider border transition-all ${
                  toolMode === "white"
                    ? "bg-white text-slate-900 border-slate-900 ring-1 ring-slate-900 shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300" />
                Blanca
              </button>

              <button
                onClick={() => setToolMode("erase")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider border transition-all ${
                  toolMode === "erase"
                    ? "bg-rose-950 text-rose-300 border-rose-800"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                Borrar
              </button>

              {stones.length > 0 && (
                <button
                  onClick={handleClearBoard}
                  className="px-3 py-2 border border-rose-300 hover:bg-rose-50 text-rose-700 text-[10px] font-mono font-bold uppercase tracking-wider transition-all"
                >
                  Vaciar
                </button>
              )}
            </div>
          </div>
          )}

          {/* Quick instructions guide */}
          {!gameHistory && (
          <div className="w-full bg-slate-50/50 p-4 border border-slate-200/50 text-[11px] text-slate-500 leading-relaxed font-mono mt-4">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">Editor Controls:</span>
            <ul className="list-disc pl-4 space-y-1">
              <li>Haz clic sobre intersecciones para colocar piedras.</li>
              <li>Haz clic en piedras del mismo color del menú para eliminarlas.</li>
              <li>Haz clic con el color opuesto para cambiarlo.</li>
            </ul>
          </div>
          )}
        </section>

        {/* COLUMN 3: API RESPONSE & HISTORY (SgfPanel & SavedGames) */}
        <section className="col-span-1 lg:col-span-3 bg-[#1E1E1E] flex flex-col divide-y divide-slate-850">
          
          <div className="p-0 shrink-0">
            <SgfPanel 
              sgf={currentSgf} 
              onImportSgf={handleImportSgf} 
            />
          </div>

          <div className="p-0 flex-grow bg-white border-t border-slate-200 overflow-y-auto">
            <SavedGames
              savedGames={savedGames}
              onLoadGame={handleLoadGame}
              onDeleteGame={handleDeleteGame}
              onSaveCurrentGame={handleSaveGame}
              hasStones={stones.length > 0}
            />
          </div>

          {/* Live game evolution: score, temperature (|Δscore|), entropy */}
          <div className="p-6 bg-[#1A1A1A] text-white shrink-0">
            <GameChart metricsHistory={metricsHistory} currentStep={currentStep} />
          </div>
        </section>
      </main>

      {/* Footer Bar */}
      <footer className="h-12 bg-white border-t border-slate-200 flex items-center justify-between px-8 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400 shrink-0">
        <div className="flex gap-6">
          <span className="text-slate-900">● System Status: Operational</span>
          <span className="hidden sm:inline">Node Cluster: Tokyo-01</span>
          <span className="hidden sm:inline">SSL: AES-256</span>
        </div>
      </footer>
    </div>
  );
}
