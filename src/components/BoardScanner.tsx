import React, { useState, useRef, useEffect } from "react";
import { Camera, Upload, RefreshCw, AlertCircle, X, ShieldAlert } from "lucide-react";
import { BoardSize, Stone } from "../types";
import CornerAdjuster from "./CornerAdjuster";

interface BoardScannerProps {
  boardSize: BoardSize;
  onScanSuccess: (boardSize: BoardSize, stones: Stone[], imageUrl?: string) => void;
  onScanError: (error: string) => void;
}

export default function BoardScanner({
  boardSize,
  onScanSuccess,
  onScanError,
}: BoardScannerProps) {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Animated scanner step phrases
  const steps = [
    "Inicializando motor de visión artificial de Gemini...",
    "Alineando cuadrícula del tablero...",
    "Detectando intersecciones y esquinas...",
    "Clasificando piedras blancas y negras...",
    "Verificando simetría de juego y exportando SGF...",
  ];

  // Rotate through steps during mock/real loading
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      setProgressStep(0);
      interval = setInterval(() => {
        setProgressStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  // Start Camera
  const startCamera = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      setCameraStream(stream);
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setErrorMsg(
        "No se pudo acceder a la cámara. Asegúrate de dar los permisos correspondientes o sube una imagen localmente."
      );
    }
  };

  // Stop Camera
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  // Call the server API to analyze the image
  const analyzeImage = async (base64Image: string, mimeType: string) => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64Image,
          mimeType: mimeType,
          boardSize: boardSize,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al procesar la imagen.");
      }

      const data = await response.json();
      
      // Store image preview URL in success
      const previewUrl = `data:${mimeType};base64,${base64Image}`;
      onScanSuccess(data.boardSize as BoardSize, data.stones as Stone[], previewUrl);
    } catch (err: any) {
      console.error("Analysis failed:", err);
      setErrorMsg(err.message || "Error al analizar la imagen. Intenta con una foto con mejor luz o más centrada.");
      onScanError(err.message || "Error al analizar la imagen.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Capture Image from Video Stream
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (context) {
      // Capture the full frame — the corner-adjustment step handles framing,
      // so we no longer pre-crop to a centered square here.
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

      stopCamera();
      setCapturedImage({ dataUrl, mimeType: "image/jpeg" });
    }
  };

  // Handle local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processUploadedFile(file);
  };

  const processUploadedFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        const mimeType = file.type || "image/jpeg";
        setCapturedImage({ dataUrl: result, mimeType });
      }
    };
    reader.readAsDataURL(file);
  };

  // Called once the user confirms the rectified crop from CornerAdjuster
  const handleCornersConfirmed = (base64Jpeg: string) => {
    setCapturedImage(null);
    analyzeImage(base64Jpeg, "image/jpeg");
  };

  // Drag and Drop support
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="bg-white rounded-none p-6 border border-slate-200 shadow-xs">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Camera className="w-4 h-4 text-slate-900" />
          Source Input (Escanear)
        </h2>
        <span className="text-[10px] bg-slate-900 text-white px-2 py-0.5 rounded-none font-bold tracking-wider uppercase">
          {boardSize}x{boardSize}
        </span>
      </div>

      {errorMsg && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-none flex gap-2.5 items-start text-xs font-mono">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1">
            <p className="font-bold">SCAN_ERROR</p>
            <p className="mt-0.5 opacity-90">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main scanner interactive window */}
      <div className="relative">
        {/* Hidden processing canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {isProcessing ? (
          <div className="aspect-square w-full rounded-none bg-slate-900 flex flex-col items-center justify-center p-8 text-center overflow-hidden relative border border-slate-800">
            {/* Pulsing light circles background */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.08)_0%,transparent_60%)]" />
            
            {/* Animated Laser Scanning Line */}
            <div className="absolute left-0 right-0 h-0.5 bg-sky-400 shadow-[0_0_15px_#38bdf8] animate-[bounce_3s_infinite]" />

            <div className="relative z-10 flex flex-col items-center">
              <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mb-4" />
              <h3 className="text-white font-mono text-xs uppercase tracking-widest mb-2">Processing POV...</h3>
              
              {/* Steps Progress Visual */}
              <div className="w-48 bg-slate-800 h-1 mb-4 overflow-hidden rounded-none">
                <div 
                  className="bg-sky-500 h-full transition-all duration-1000 ease-out"
                  style={{ width: `${((progressStep + 1) / steps.length) * 100}%` }}
                />
              </div>

              <p className="text-[10px] text-slate-400 font-mono h-8 max-w-xs animate-pulse leading-normal">
                {steps[progressStep]}
              </p>
            </div>
          </div>
        ) : capturedImage ? (
          <CornerAdjuster
            imageDataUrl={capturedImage.dataUrl}
            onConfirm={handleCornersConfirmed}
            onCancel={() => setCapturedImage(null)}
          />
        ) : isCameraActive ? (
          <div className="aspect-square w-full rounded-none bg-black overflow-hidden relative border border-slate-800">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Camera Overlay HUD to guide alignment */}
            <div className="absolute inset-0 border-[20px] border-black/60 pointer-events-none flex items-center justify-center">
              <div className="w-full aspect-square border border-dashed border-white/40 relative">
                {/* Scanner Target corners */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-white" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-white" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-white" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white" />
              </div>
            </div>

            {/* Instruction tooltip in Camera */}
            <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-black/80 px-2.5 py-0.5 rounded-none text-[9px] font-mono uppercase text-white tracking-widest whitespace-nowrap z-20 pointer-events-none">
              Alinea el tablero en el recuadro
            </div>

            {/* Action buttons on top of Camera */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 px-4 z-20">
              <button
                onClick={stopCamera}
                className="px-4 py-2 bg-slate-800/90 hover:bg-slate-800 text-white rounded-none text-[10px] font-bold uppercase tracking-wider transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={capturePhoto}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-950 text-white rounded-none text-[10px] font-bold uppercase tracking-wider shadow-lg transition-colors flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                Capturar
              </button>
            </div>
          </div>
        ) : (
          /* Drag and drop / Trigger card */
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`aspect-square w-full rounded-none border border-dashed flex flex-col items-center justify-center p-6 text-center transition-all duration-200 cursor-pointer ${
              dragActive
                ? "border-slate-900 bg-slate-50"
                : "border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="bg-white p-3 rounded-none border border-slate-200 mb-3 text-slate-500 transition-colors">
              <Upload className="w-5 h-5 text-slate-600" />
            </div>
            
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Sube una foto del tablero
            </p>
            <p className="text-[10px] text-slate-400 mt-1 max-w-[210px] leading-normal font-mono">
              Arrastra tu imagen aquí o haz clic para explorar archivos.
            </p>

            <div className="relative flex items-center justify-center my-4 w-full">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-slate-50 px-2 text-slate-400 uppercase tracking-widest text-[9px] font-mono">o</span>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                startCamera();
              }}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white rounded-none text-[10px] font-bold uppercase tracking-widest transition-all shadow-xs flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              Usar Cámara
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        )}
      </div>

      <div className="mt-4 bg-slate-50 p-4 rounded-none text-[11px] text-slate-500 leading-relaxed border border-slate-200/80 font-mono">
        <span className="font-bold text-slate-900 block mb-1 uppercase tracking-wider text-[10px]">💡 DETECT_INFO:</span>
        Intenta centrar el tablero, tener buena luz y colocar la cámara directamente encima del tablero (vista cenital) para que Gemini AI pueda alinear perfectamente la cuadrícula y las piedras.
      </div>
    </div>
  );
}
