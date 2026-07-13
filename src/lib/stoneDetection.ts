import { BoardSize, Stone } from "../types";
import { RECTIFIED_SIZE } from "./perspectiveWarp";

type StoneColor = "black" | "white";

interface ClusterResult {
  blackCenter: number;
  woodCenter: number;
  whiteCenter: number;
  min: number;
  max: number;
  confident: boolean;
}

interface HoughCircle {
  x: number;
  y: number;
  r: number;
}

interface GridSample {
  col: number;
  row: number;
  x: number;
  y: number;
  mean: number;
  texture: number;
}

/**
 * Simple 1D k-means (k=3: black/wood/white) over grid-point brightness samples.
 * Seeded from min/median/max, which is well-justified for this data shape: the
 * majority of points on a real board are empty wood (median lands there), while
 * the extremes are dominated by the darkest black stone and brightest white
 * stone, if any exist. Converges in a handful of iterations for well-separated
 * brightness populations like a real photo's black/wood/white stones.
 */
function kMeans1D(values: number[], k: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let centers = Array.from({ length: k }, (_, i) => sorted[Math.floor((i * (n - 1)) / (k - 1))]);

  for (let iter = 0; iter < 20; iter++) {
    const buckets: number[][] = Array.from({ length: k }, () => []);
    for (const v of values) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < k; i++) {
        const d = Math.abs(v - centers[i]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      buckets[bestIdx].push(v);
    }

    const newCenters = buckets.map((bucket, i) => {
      if (bucket.length > 0) {
        return bucket.reduce((a, b) => a + b, 0) / bucket.length;
      }
      // Empty cluster — reseed to the single farthest-from-all-current-centers
      // value, rather than leaving it frozen/NaN, so the algorithm stays
      // numerically stable (e.g. a board with zero white stones).
      let farthest = values[0];
      let farthestDist = -1;
      for (const v of values) {
        const d = Math.min(...centers.map((c) => Math.abs(v - c)));
        if (d > farthestDist) {
          farthestDist = d;
          farthest = v;
        }
      }
      return farthest;
    });

    newCenters.sort((a, b) => a - b);
    const maxShift = Math.max(...newCenters.map((c, i) => Math.abs(c - centers[i])));
    centers = newCenters;
    if (maxShift < 0.5) break;
  }

  return centers;
}

function kMeansBrightness(values: number[]): ClusterResult {
  const [blackCenter, woodCenter, whiteCenter] = kMeans1D(values, 3);
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;
  const gapMin = Math.max(0.15 * range, 15);
  const confident = range >= 25 && woodCenter - blackCenter >= gapMin && whiteCenter - woodCenter >= gapMin;

  return { blackCenter, woodCenter, whiteCenter, min, max, confident };
}

/**
 * Classifies a brightness value as black/white only if it sits deep in the
 * "pure" end of its cluster's gap toward wood — not merely on the black/white
 * side of the midpoint. A dark gray shadow can easily be *closer to* black
 * than to wood (nearest-center would call it black) while still being far
 * from *actually* black; requiring it to fall within `strictness` of the true
 * black/white extreme rejects that "confused gray" middle ground, matching
 * the physical reality that real stones are intensely black or intensely
 * white, while shadows/glare are comparatively washed-out gray.
 */
function classifyByIntensity(value: number, cluster: ClusterResult, strictness = 0.3): StoneColor | "wood" {
  const blackBoundary = cluster.blackCenter + strictness * (cluster.woodCenter - cluster.blackCenter);
  const whiteBoundary = cluster.whiteCenter - strictness * (cluster.whiteCenter - cluster.woodCenter);
  if (value <= blackBoundary) return "black";
  if (value >= whiteBoundary) return "white";
  return "wood";
}

function computeMedian(data: Uint8Array | Uint8ClampedArray): number {
  // grayMat is single-channel CV_8UC1, so `data` is a flat array of per-pixel intensities.
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i++) histogram[data[i]]++;
  const half = data.length / 2;
  let cumulative = 0;
  for (let v = 0; v < 256; v++) {
    cumulative += histogram[v];
    if (cumulative >= half) return v;
  }
  return 128;
}

function oddify(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r + 1 : r;
}

function unpackCircles(circlesMat: any): HoughCircle[] {
  const circles: HoughCircle[] = [];
  for (let i = 0; i < circlesMat.data32F.length; i += 3) {
    circles.push({
      x: circlesMat.data32F[i],
      y: circlesMat.data32F[i + 1],
      r: circlesMat.data32F[i + 2],
    });
  }
  return circles;
}

/**
 * Detects black/white stones on an already perspective-rectified board image
 * using classical CV only (no AI): cv.HoughCircles finds circular stone-like
 * blobs (robust to a few pixels of grid misalignment and, because it requires
 * a coherent circular gradient arc, inherently resistant to soft/irregular
 * shadow artifacts), cross-checked with adaptive brightness clustering over
 * the theoretical grid intersections as a fallback for points Hough misses.
 *
 * Assumes `corners` used to produce `canvas` were the board's outermost grid
 * intersections (not its physical wooden edge) — see CornerAdjuster's UI copy.
 *
 * Never throws: on any internal failure, or on insufficiently-separated
 * black/wood/white brightness (bad lighting/contrast), degrades to returning
 * whatever it could confidently confirm rather than surfacing an error — the
 * user can hand-correct the result in the existing board editor either way.
 *
 * Before classification, a large-kernel illumination correction (division by
 * a heavily-blurred "background" estimate, ratio-capped) normalizes a soft
 * cast shadow covering part of the board — otherwise shadowed empty wood
 * reads as dark as a real black stone to a single global brightness
 * threshold/cluster. The correction ratio is capped ([0.7, 1.4]) so it can't
 * meaningfully erode a large solid block of same-color stones (a legitimate
 * board state) the way it corrects a shadow.
 *
 * Brightness alone still can't fully tell "shadowed empty wood" apart from
 * "a real stone", because both are just "a dark region" — so the fallback
 * (non-Hough) classification pass also checks local texture (mean absolute
 * Laplacian response) at each point: an empty intersection still has the
 * physical grid lines crossing through it (faint but present even under a
 * shadow, since shadows dim brightness but don't erase the underlying wood
 * grain/line structure), while a real stone's surface is smooth there — no
 * lines can show through something physically sitting on top of them. This
 * is a structural signal, not a brightness one, so it's largely immune to
 * illumination level. It's calibrated per-photo from the Hough-confirmed
 * stones' own texture scores (the most trustworthy "known stone" samples
 * available), not a fixed threshold.
 */
export function detectStonesClassically(canvas: HTMLCanvasElement, boardSize: BoardSize): Stone[] {
  const cv = (window as any).cv;
  if (!cv) {
    console.error("detectStonesClassically called before OpenCV was loaded");
    return [];
  }

  let srcMat: any,
    grayMat: any,
    backgroundMat: any,
    correctedMat: any,
    blurredMat: any,
    circlesMat: any,
    mask: any,
    clampLow: any,
    clampHigh: any,
    laplacianMat: any,
    textureMat: any;

  try {
    srcMat = cv.imread(canvas);
    grayMat = new cv.Mat();
    cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);

    const cellSize = RECTIFIED_SIZE / (boardSize - 1);
    const sampleRadius = cellSize * 0.25;
    const medianGray = computeMedian(grayMat.data);

    // Illumination correction: estimate a smoothly-varying background (kernel
    // much larger than a stone, so an isolated stone can't meaningfully drag
    // down its own local estimate) and divide it out, anchored to this photo's
    // own median so evenly-lit photos are effectively unaffected.
    const bgKernel = oddify(Math.min(351, Math.max(121, 3 * cellSize)));
    backgroundMat = new cv.Mat();
    cv.GaussianBlur(grayMat, backgroundMat, new cv.Size(bgKernel, bgKernel), bgKernel / 6);

    // Cap how far the background estimate may drift from the true median so a
    // large solid block/wall of same-color stones can't be "corrected" away —
    // tightened from an earlier [0.7, 1.4] cap after finding it still let a
    // solid column of real stones on an actual photo get eroded toward wood
    // brightness (background estimate pulled to its floor, then maximally
    // corrected). Shadow correction now leans more on the texture gate below
    // (a structural, non-brightness signal), so illumination correction itself
    // can afford to be more conservative here without losing shadow robustness.
    clampLow = new cv.Mat(grayMat.rows, grayMat.cols, cv.CV_8UC1, new cv.Scalar(medianGray / 1.15));
    clampHigh = new cv.Mat(grayMat.rows, grayMat.cols, cv.CV_8UC1, new cv.Scalar(medianGray / 0.87));
    cv.max(backgroundMat, clampLow, backgroundMat);
    cv.min(backgroundMat, clampHigh, backgroundMat);

    correctedMat = new cv.Mat();
    cv.divide(grayMat, backgroundMat, correctedMat, medianGray, cv.CV_8U);

    blurredMat = new cv.Mat();
    cv.GaussianBlur(correctedMat, blurredMat, new cv.Size(5, 5), 1.2);

    // Local texture (fine grid-line presence) map, used only by the fallback
    // pass — see the function doc comment for why this is illumination-robust
    // in a way pure brightness clustering can't be.
    laplacianMat = new cv.Mat();
    cv.Laplacian(blurredMat, laplacianMat, cv.CV_16S, 3);
    textureMat = new cv.Mat();
    cv.convertScaleAbs(laplacianMat, textureMat);

    mask = new cv.Mat(grayMat.rows, grayMat.cols, cv.CV_8UC1, new cv.Scalar(0));
    const white = new cv.Scalar(255, 255, 255, 255);
    const black = new cv.Scalar(0, 0, 0, 0);

    const sampleDiskMean = (cx: number, cy: number, r: number): number => {
      mask.setTo(black);
      cv.circle(mask, new cv.Point(cx, cy), Math.max(1, Math.round(r)), white, -1);
      return cv.mean(correctedMat, mask)[0];
    };

    const sampleAnnulusMean = (cx: number, cy: number, rInner: number, rOuter: number): number => {
      mask.setTo(black);
      cv.circle(mask, new cv.Point(cx, cy), Math.max(1, Math.round(rOuter)), white, -1);
      cv.circle(mask, new cv.Point(cx, cy), Math.max(1, Math.round(rInner)), black, -1);
      return cv.mean(correctedMat, mask)[0];
    };

    // Sampled well inside a plausible stone's own radius (never near its edge,
    // which would show high texture regardless of whether it's a real stone).
    const sampleTextureScore = (cx: number, cy: number, r: number): number => {
      mask.setTo(black);
      cv.circle(mask, new cv.Point(cx, cy), Math.max(1, Math.round(r)), white, -1);
      return cv.mean(textureMat, mask)[0];
    };

    // 1. Sample every theoretical grid intersection's brightness + texture.
    const gridSamples: GridSample[] = [];
    for (let col = 0; col < boardSize; col++) {
      for (let row = 0; row < boardSize; row++) {
        const x = col * cellSize;
        const y = row * cellSize;
        gridSamples.push({
          col,
          row,
          x,
          y,
          mean: sampleDiskMean(x, y, sampleRadius),
          texture: sampleTextureScore(x, y, sampleRadius * 0.8),
        });
      }
    }

    // 2. Adaptive black/wood/white clustering over those samples.
    const cluster = kMeansBrightness(gridSamples.map((s) => s.mean));

    // 3. Hough circle detection for direct stone-blob finding.
    const param1 = Math.min(150, Math.max(50, 1.33 * medianGray));
    circlesMat = new cv.Mat();
    cv.HoughCircles(
      blurredMat,
      circlesMat,
      cv.HOUGH_GRADIENT,
      1,
      cellSize * 0.75,
      param1,
      25,
      Math.round(cellSize * 0.35),
      Math.round(cellSize * 0.52)
    );
    const houghCircles = unpackCircles(circlesMat);

    // 4. Snap Hough circles to theoretical grid points, classify, filter on
    // shape + ring-contrast + intensity (NOT texture yet — texture is applied
    // in a second pass below, once we have a trustworthy calibration set).
    const snapTolerance = cellSize * 0.35;
    interface ProvisionalClaim {
      key: string;
      label: StoneColor;
      innerMean: number;
      texture: number;
    }
    const provisionalClaims = new Map<string, ProvisionalClaim>();

    for (const circle of houghCircles) {
      let nearest: GridSample | null = null;
      let nearestDist = Infinity;
      for (const sample of gridSamples) {
        const d = Math.hypot(sample.x - circle.x, sample.y - circle.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = sample;
        }
      }
      if (!nearest || nearestDist > snapTolerance) continue;
      const key = `${nearest.col},${nearest.row}`;
      if (provisionalClaims.has(key)) continue; // Hough already orders by descending confidence.

      const innerMean = sampleDiskMean(circle.x, circle.y, circle.r * 0.6);
      const ringInner = circle.r * 1.08;
      const ringOuter = Math.min(circle.r * 1.35, cellSize * 0.48);
      const ringMean = sampleAnnulusMean(circle.x, circle.y, ringInner, ringOuter);

      const minContrast = Math.max(20, 0.25 * (cluster.max - cluster.min));
      if (Math.abs(innerMean - ringMean) < minContrast) continue; // shadow/glare edge, reject

      // Shape + ring-contrast are already strong evidence here, and the texture
      // check right below adds a third, independent confirmation — so intensity
      // itself can stay close to a plain midpoint split; over-tightening it on
      // top of two other gates was rejecting real stones with a normal (not
      // perfectly pure) black/white tone, not just shadow artifacts.
      const label = classifyByIntensity(innerMean, cluster, 0.5);
      if (label === "wood") continue; // circular but not on the black/white side at all, reject

      const circleTexture = sampleTextureScore(circle.x, circle.y, circle.r * 0.5);
      provisionalClaims.set(key, { key, label, innerMean, texture: circleTexture });
    }

    // Texture ceiling calibrated from the STRICTEST-intensity provisional
    // claims only (strictness 0.15 — deep into the pure black/white zone),
    // using the MEDIAN (not max) so a single bad claim can't inflate the
    // ceiling for everyone else. Computing this from Hough's own claims is
    // grounded in this specific photo's real stones; computing it globally
    // from every grid point instead (an earlier attempt) backfired — shadowed
    // wood's texture turned out to overlap real stones' texture too much for
    // an unsupervised 2-way split to land in the right place.
    //
    // Calibrated PER COLOR, not shared: black and white stones can have
    // genuinely different baseline texture (e.g. a rendered/digital board
    // where black stones carry a subtle gradient/highlight white stones
    // don't). A shared ceiling silently zeroes out an entire color whenever
    // Hough's confirmed claims happen to skew to the other color — found on
    // a real digital kifu diagram where all Hough-confirmed stones were
    // white, which starved every real black stone's fallback classification
    // even though brightness clustering was highly confident about them.
    const textureCeilingFor = (color: StoneColor): number => {
      const trusted = [...provisionalClaims.values()]
        .filter((c) => c.label === color && classifyByIntensity(c.innerMean, cluster, 0.15) === color)
        .map((c) => c.texture)
        .sort((a, b) => a - b);
      return trusted.length > 0 ? trusted[Math.floor(trusted.length / 2)] * 1.3 : Infinity;
    };
    const textureCeilingBlack = textureCeilingFor("black");
    const textureCeilingWhite = textureCeilingFor("white");
    const textureCeilingByColor: Record<StoneColor, number> = { black: textureCeilingBlack, white: textureCeilingWhite };

    const claimed = new Map<string, StoneColor>();
    for (const claim of provisionalClaims.values()) {
      if (claim.texture > textureCeilingByColor[claim.label]) continue;
      claimed.set(claim.key, claim.label);
    }

    // 5. Assemble final stones: Hough-claimed points win outright; unclaimed points
    // fall back to the direct grid-sample classification, gated by both cluster
    // confidence AND the texture ceiling (rejects points that still show grid-line
    // texture — i.e. still empty wood, most likely under a shadow that survived
    // illumination correction — even though their brightness alone looked stone-like).
    //
    // (An earlier version of this also gated the fallback on local ring-*brightness*-
    // contrast, mirroring the Hough check — removed: that ring's inner radius
    // unavoidably overlapped a real stone's own edge whenever stones are
    // adjacent/touching, which is extremely common in real positions, causing
    // legitimate stones to be rejected. The texture gate replaces it with a
    // signal sampled well inside the point itself, not a surrounding ring.)
    const stones: Stone[] = [];
    for (const sample of gridSamples) {
      const key = `${sample.col},${sample.row}`;
      const houghLabel = claimed.get(key);
      if (houghLabel) {
        stones.push({ x: sample.col, y: sample.row, color: houghLabel });
      } else if (cluster.confident) {
        // No shape evidence at all here (Hough didn't claim this point), so
        // intensity must be judged strictly: only genuinely dark/bright points
        // count, not "merely on the black/white side of wood".
        const label = classifyByIntensity(sample.mean, cluster, 0.3);
        if (label === "wood") continue;
        if (sample.texture > textureCeilingByColor[label]) continue;
        stones.push({ x: sample.col, y: sample.row, color: label });
      }
    }

    return stones;
  } catch (err) {
    console.error("Classical stone detection failed, returning empty board:", err);
    return [];
  } finally {
    srcMat?.delete();
    grayMat?.delete();
    backgroundMat?.delete();
    correctedMat?.delete();
    blurredMat?.delete();
    circlesMat?.delete();
    mask?.delete();
    clampLow?.delete();
    clampHigh?.delete();
    laplacianMat?.delete();
    textureMat?.delete();
  }
}
