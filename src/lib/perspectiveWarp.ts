import Jscanify from "jscanify/client";
import { Corners } from "../types";
import { getOpenCv } from "./opencv";

export const RECTIFIED_SIZE = 900;

/**
 * Perspective-warps the source image to a top-down square using the given
 * corners. Returns the raw canvas (not a re-encoded JPEG) so pixel-level
 * classical CV (see stoneDetection.ts) can sample it without JPEG
 * compression artifacts landing right at stone edges.
 */
export async function rectifyBoard(img: HTMLImageElement, corners: Corners): Promise<HTMLCanvasElement> {
  await getOpenCv();
  const scanner = new Jscanify();

  const canvas = scanner.extractPaper(img, RECTIFIED_SIZE, RECTIFIED_SIZE, {
    topLeftCorner: corners.topLeft,
    topRightCorner: corners.topRight,
    bottomLeftCorner: corners.bottomLeft,
    bottomRightCorner: corners.bottomRight,
  });

  if (!canvas) {
    throw new Error("No se pudo rectificar la imagen del tablero.");
  }

  return canvas;
}

export function canvasToJpegBase64(canvas: HTMLCanvasElement, quality = 0.9): string {
  return canvas.toDataURL("image/jpeg", quality).split(",")[1];
}
