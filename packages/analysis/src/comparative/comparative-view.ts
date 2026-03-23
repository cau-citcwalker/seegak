import type { ScatterChart } from '@seegak/bio-charts';

// ─── Types ───

export interface ComparisonGroup {
  label: string;
  obsIndices: Uint32Array;
  color?: string;
}

export interface ComparativeViewOptions {
  layout: 'side-by-side' | 'overlay';
  syncZoom?: boolean;
  syncPan?: boolean;
  groupA: ComparisonGroup;
  groupB: ComparisonGroup;
}

// ─── ComparativeViewController ───

export class ComparativeViewController {
  private options: ComparativeViewOptions;

  constructor(options: ComparativeViewOptions) {
    this.options = options;
  }

  /**
   * Sync camera between two charts.
   * Returns an unsubscribe function.
   */
  linkCharts(chartA: ScatterChart, chartB: ScatterChart): () => void {
    const { syncZoom = true, syncPan = true } = this.options;

    let syncing = false;

    const applyCamera = (source: ScatterChart, target: ScatterChart): void => {
      if (syncing) return;
      syncing = true;
      const cam = source['engine'].camera;
      const update: { zoom?: number; center?: { x: number; y: number } } = {};
      if (syncZoom) update.zoom = cam.zoom;
      if (syncPan) update.center = { ...cam.center };
      if (Object.keys(update).length > 0) target.setCamera(update);
      syncing = false;
    };

    // Poll camera state each animation frame (mirrors the pattern in AnnotationOverlay)
    let rafId = 0;
    let lastZoomA = 0, lastCXA = 0, lastCYA = 0;
    let lastZoomB = 0, lastCXB = 0, lastCYB = 0;

    const loop = (): void => {
      const camA = chartA['engine'].camera;
      const camB = chartB['engine'].camera;

      const aChanged =
        camA.zoom !== lastZoomA ||
        camA.center.x !== lastCXA ||
        camA.center.y !== lastCYA;

      const bChanged =
        camB.zoom !== lastZoomB ||
        camB.center.x !== lastCXB ||
        camB.center.y !== lastCYB;

      if (aChanged && !syncing) {
        lastZoomA = camA.zoom; lastCXA = camA.center.x; lastCYA = camA.center.y;
        applyCamera(chartA, chartB);
        lastZoomB = camB.zoom; lastCXB = camB.center.x; lastCYB = camB.center.y;
      } else if (bChanged && !syncing) {
        lastZoomB = camB.zoom; lastCXB = camB.center.x; lastCYB = camB.center.y;
        applyCamera(chartB, chartA);
        lastZoomA = camA.zoom; lastCXA = camA.center.x; lastCYA = camA.center.y;
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(rafId); };
  }

  /** Get subset of x/y data for a given group */
  getGroupData(
    x: Float32Array,
    y: Float32Array,
    group: ComparisonGroup,
  ): { x: Float32Array; y: Float32Array } {
    const idx = group.obsIndices;
    const n = idx.length;
    const outX = new Float32Array(n);
    const outY = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      outX[i] = x[idx[i]!]!;
      outY[i] = y[idx[i]!]!;
    }
    return { x: outX, y: outY };
  }

  /**
   * Compute basic DE stats between groups.
   * For each gene: log2(mean_A / mean_B) and a Welch's t-test p-value approximation.
   */
  computeDifferentialExpression(
    expression: Float32Array,
    nObs: number,
    nVars: number,
  ): Promise<{ log2fc: Float32Array; pvals: Float32Array }> {
    const { groupA, groupB } = this.options;

    return new Promise((resolve) => {
      setTimeout(() => {
        const log2fc = new Float32Array(nVars);
        const pvals = new Float32Array(nVars);

        const indA = groupA.obsIndices;
        const indB = groupB.obsIndices;
        const nA = indA.length;
        const nB = indB.length;

        for (let v = 0; v < nVars; v++) {
          // Means
          let sumA = 0, sumB = 0;
          for (let i = 0; i < nA; i++) sumA += expression[indA[i]! * nVars + v]!;
          for (let i = 0; i < nB; i++) sumB += expression[indB[i]! * nVars + v]!;
          const meanA = nA > 0 ? sumA / nA : 0;
          const meanB = nB > 0 ? sumB / nB : 0;

          // log2 fold change (add pseudocount 1e-9 to avoid log(0))
          log2fc[v] = Math.log2((meanA + 1e-9) / (meanB + 1e-9));

          // Welch's t-test
          if (nA < 2 || nB < 2) {
            pvals[v] = 1.0;
            continue;
          }

          let varA = 0, varB = 0;
          for (let i = 0; i < nA; i++) {
            const d = expression[indA[i]! * nVars + v]! - meanA;
            varA += d * d;
          }
          for (let i = 0; i < nB; i++) {
            const d = expression[indB[i]! * nVars + v]! - meanB;
            varB += d * d;
          }
          varA /= (nA - 1);
          varB /= (nB - 1);

          const seA = varA / nA;
          const seB = varB / nB;
          const se = seA + seB;

          if (se === 0) {
            pvals[v] = meanA === meanB ? 1.0 : 0.0;
            continue;
          }

          const t = (meanA - meanB) / Math.sqrt(se);

          // Welch–Satterthwaite degrees of freedom
          const df = se * se / (
            (seA * seA) / (nA - 1) +
            (seB * seB) / (nB - 1)
          );

          // Two-sided p-value approximation using normal distribution for large df
          // For small df use t-distribution approximation via incomplete beta
          pvals[v] = _tTestPValue(t, df);
        }

        resolve({ log2fc, pvals });
      }, 0);
    });
  }
}

// ─── t-test p-value approximation ───

/** Two-sided p-value from t-statistic and degrees of freedom.
 *  Uses a normal approximation for df > 30, and a rational approximation
 *  for the regularized incomplete beta function for smaller df.
 */
function _tTestPValue(t: number, df: number): number {
  const absT = Math.abs(t);
  if (df <= 0 || !isFinite(absT)) return 1.0;

  if (df > 30) {
    // Normal approximation
    return 2 * (1 - _normalCDF(absT));
  }

  // t-distribution via regularized incomplete beta:
  // P(|T| > t) = I(df/(df+t²), df/2, 1/2)
  const x = df / (df + t * t);
  return _incompleteBeta(x, df / 2, 0.5);
}

function _normalCDF(z: number): number {
  // Abramowitz & Stegun approximation (error < 7.5e-8)
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const p = 0.2316419;
  const t = 1 / (1 + p * z);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  return 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
}

/** Regularized incomplete beta function I_x(a,b) via continued fraction */
function _incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use continued fraction representation (Lentz algorithm)
  const lbeta = _logBeta(a, b);
  const frontFactor = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta) / a;

  // Use symmetry relation when x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - _incompleteBeta(1 - x, b, a);
  }

  // Continued fraction (max 200 iterations)
  let h = 1;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  h = d;

  for (let m = 1; m <= 100; m++) {
    // Even step
    let aa = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= c * d;

    // Odd step
    aa = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    h *= delta;

    if (Math.abs(delta - 1) < 3e-7) break;
  }

  return frontFactor * h;
}

function _logBeta(a: number, b: number): number {
  return _logGamma(a) + _logGamma(b) - _logGamma(a + b);
}

/** Lanczos approximation for log-gamma */
function _logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - _logGamma(1 - x);
  }
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
