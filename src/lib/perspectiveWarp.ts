import Jscanify from "jscanify/client";
import { Corners } from "../types";
import { getOpenCv } from "./opencv";

const OUTPUT_SIZE = 900;

export async function warpAndEncode(
  img: HTMLImageElement,
  corners: Corners
): Promise<string> {
  await getOpenCv();
  const scanner = new Jscanify();

  const canvas = scanner.extractPaper(img, OUTPUT_SIZE, OUTPUT_SIZE, {
    topLeftCorner: corners.topLeft,
    topRightCorner: corners.topRight,
    bottomLeftCorner: corners.bottomLeft,
    bottomRightCorner: corners.bottomRight,
  });

  if (!canvas) {
    throw new Error("No se pudo rectificar la imagen del tablero.");
  }

  return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
}
