import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config({ path: [".env.local", ".env"] });

const app = express();
const PORT = 3000;

// Increased payload limit for large base64 images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Gemini client on the server side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Endpoint for analyzing Go Board images
app.post("/api/analyze", async (req, res) => {
  try {
    const { image, mimeType, boardSize } = req.body;

    if (!image) {
      return res.status(400).json({ error: "No image data provided" });
    }

    const requestedSize = boardSize || 19;

    const systemInstruction = `Eres una inteligencia artificial experta en el juego de Go (Weiqi / Baduk) y visión por computadora.
Tu tarea es analizar una foto o imagen de un tablero de Go de tamaño ${requestedSize}x${requestedSize} y detectar con la mayor precisión posible la ubicación de todas las piedras blancas y negras en la cuadrícula.

Reglas de coordenadas para la detección:
- El tablero de Go tiene un tamaño de cuadrícula de ${requestedSize}x${requestedSize}.
- Las coordenadas son de tipo (x, y) estilo índice de matriz (0-indexed):
  - 'x' representa la columna, de izquierda a derecha (valores enteros de 0 a ${requestedSize - 1}).
  - 'y' representa la fila, de arriba hacia abajo (valores enteros de 0 a ${requestedSize - 1}).
- La imagen ya viene rectificada geométricamente (vista cenital, corrección de perspectiva ya aplicada de forma externa): representa el tablero recortado y alineado a un cuadrado. No necesitas corregir perspectiva ni proyectar la imagen; concéntrate únicamente en identificar con precisión, para cada una de las ${requestedSize * requestedSize} intersecciones de la cuadrícula, si está vacía o si contiene una piedra negra o blanca. Ignora sombras o reflejos menores.
- Clasifica las piedras detectadas únicamente en "black" (piedras negras) o "white" (piedras blancas).
- Entrega el tamaño del tablero detectado y la lista de piedras encontradas.`;

    const prompt = `Analiza la imagen adjunta de un tablero de Go.
Identifica todas las piedras negras y blancas colocadas en las intersecciones del tablero de ${requestedSize}x${requestedSize}.
Asegúrate de que las coordenadas x e y estén dentro del rango de 0 a ${requestedSize - 1}.
Sé sumamente preciso y exhaustivo.`;

    const imagePart = {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: image,
      },
    };

    const textPart = {
      text: prompt,
    };

    // Use gemini-3.5-flash for the vision-based analysis
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        systemInstruction,
        temperature: 0.1, // low temperature for precise factual detection
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            boardSize: {
              type: Type.INTEGER,
              description: "El tamaño del tablero de Go analizado (generalmente 9, 13 o 19).",
            },
            stones: {
              type: Type.ARRAY,
              description: "Lista de piedras detectadas en el tablero.",
              items: {
                type: Type.OBJECT,
                properties: {
                  x: {
                    type: Type.INTEGER,
                    description: "Coordenada X (columna) de la piedra, de 0 a boardSize-1 (izquierda a derecha).",
                  },
                  y: {
                    type: Type.INTEGER,
                    description: "Coordenada Y (fila) de la piedra, de 0 a boardSize-1 (arriba hacia abajo).",
                  },
                  color: {
                    type: Type.STRING,
                    description: "Color de la piedra, debe ser 'black' o 'white'.",
                  },
                },
                required: ["x", "y", "color"],
              },
            },
          },
          required: ["boardSize", "stones"],
        },
      },
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error("No response text received from Gemini");
    }

    const parsedData = JSON.parse(textResult.trim());
    return res.json(parsedData);
  } catch (error: any) {
    console.error("Error analyzing board:", error);
    return res.status(500).json({
      error: "Error al procesar la imagen con Gemini AI",
      details: error.message || error,
    });
  }
});

// Vite middleware for development / static serving for production
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
});
