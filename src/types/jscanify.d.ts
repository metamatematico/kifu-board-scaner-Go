declare module "jscanify/client" {
  interface CornerPoint {
    x: number;
    y: number;
  }

  interface DetectedCorners {
    topLeftCorner: CornerPoint;
    topRightCorner: CornerPoint;
    bottomLeftCorner: CornerPoint;
    bottomRightCorner: CornerPoint;
  }

  type ScanSource = HTMLImageElement | HTMLCanvasElement;

  export default class jscanify {
    findPaperContour(img: unknown): unknown;
    getCornerPoints(contour: unknown): DetectedCorners;
    highlightPaper(
      image: ScanSource,
      options?: { color?: string; thickness?: number }
    ): HTMLCanvasElement;
    extractPaper(
      image: ScanSource,
      resultWidth: number,
      resultHeight: number,
      cornerPoints?: DetectedCorners
    ): HTMLCanvasElement | null;
  }
}
