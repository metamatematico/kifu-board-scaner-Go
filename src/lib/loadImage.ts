// A detached (never-attached-to-DOM) HTMLImageElement's `.width`/`.height` IDL
// properties fall back to its natural bitmap size, unlike an on-screen <img> whose
// `.width`/`.height` reflect the rendered CSS box. opencv.js's `cv.imread` reads
// `.width`/`.height` (not naturalWidth/naturalHeight), so all corner-detection and
// perspective-warp work must run against an offscreen image like this one, decoupled
// from whatever size the visible preview happens to be displayed at.
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
}
