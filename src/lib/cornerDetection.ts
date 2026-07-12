import Jscanify from "jscanify/client";
import { Corners, Point } from "../types";
import { getOpenCv } from "./opencv";

export function defaultInsetCorners(
  width: number,
  height: number,
  marginRatio = 0.08
): Corners {
  const mx = width * marginRatio;
  const my = height * marginRatio;
  return {
    topLeft: { x: mx, y: my },
    topRight: { x: width - mx, y: my },
    bottomLeft: { x: mx, y: height - my },
    bottomRight: { x: width - mx, y: height - my },
  };
}

// Shoelace formula, used to reject degenerate/near-zero-area detections.
function quadArea(c: Corners): number {
  const pts: Point[] = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area / 2);
}

function isSaneCorners(c: Corners, width: number, height: number): boolean {
  const points = [c.topLeft, c.topRight, c.bottomLeft, c.bottomRight];
  const allFinite = points.every(
    (p) =>
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      p.x >= 0 &&
      p.x <= width &&
      p.y >= 0 &&
      p.y <= height
  );
  if (!allFinite) return false;

  const area = quadArea(c);
  return area >= width * height * 0.15;
}

export interface CornerDetectionResult {
  corners: Corners;
  autoDetected: boolean;
}

export async function detectCorners(
  img: HTMLImageElement
): Promise<CornerDetectionResult> {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const fallback = defaultInsetCorners(width, height);

  try {
    const cv = await getOpenCv();
    const scanner = new Jscanify();
    const mat = cv.imread(img);
    try {
      const contour = scanner.findPaperContour(mat);
      if (!contour) return { corners: fallback, autoDetected: false };

      const detected = scanner.getCornerPoints(contour);
      (contour as { delete?: () => void }).delete?.();

      if (
        !detected.topLeftCorner ||
        !detected.topRightCorner ||
        !detected.bottomLeftCorner ||
        !detected.bottomRightCorner
      ) {
        return { corners: fallback, autoDetected: false };
      }

      const corners: Corners = {
        topLeft: detected.topLeftCorner,
        topRight: detected.topRightCorner,
        bottomLeft: detected.bottomLeftCorner,
        bottomRight: detected.bottomRightCorner,
      };

      return isSaneCorners(corners, width, height)
        ? { corners, autoDetected: true }
        : { corners: fallback, autoDetected: false };
    } finally {
      mat.delete();
    }
  } catch (err) {
    console.error("Corner auto-detection failed, using default inset:", err);
    return { corners: fallback, autoDetected: false };
  }
}
