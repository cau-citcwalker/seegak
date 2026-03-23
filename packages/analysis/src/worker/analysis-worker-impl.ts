/**
 * Analysis worker implementation — runs in a separate thread.
 * Handles gate membership tests, gene ranking, matrix subsetting, and DE.
 */

import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from './analysis-worker-protocol.js';

// ─── Entry point ───

function handleMessage(req: AnalysisWorkerRequest): AnalysisWorkerResponse {
  switch (req.type) {
    case 'gatePoints':
      return gatePoints(req);
    case 'rankGenes':
      return rankGenes(req);
    case 'subsetMatrix':
      return subsetMatrix(req);
    case 'computeDe':
      return computeDe(req);
  }
}

// ─── Gate membership ───

function gatePoints(
  req: Extract<AnalysisWorkerRequest, { type: 'gatePoints' }>,
): AnalysisWorkerResponse {
  const { vertices, x, y, gateType, id } = req;
  const n = x.length;
  const members: number[] = [];

  if (gateType === 'polygon') {
    const nVerts = vertices.length / 2;
    for (let i = 0; i < n; i++) {
      if (_pointInPolygon(x[i]!, y[i]!, vertices, nVerts)) members.push(i);
    }
  } else if (gateType === 'rectangle') {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const nVerts = Math.min(vertices.length / 2, 4);
    for (let k = 0; k < nVerts; k++) {
      const vx = vertices[k * 2]!;
      const vy = vertices[k * 2 + 1]!;
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vy < minY) minY = vy;
      if (vy > maxY) maxY = vy;
    }
    for (let i = 0; i < n; i++) {
      const px = x[i]!, py = y[i]!;
      if (px >= minX && px <= maxX && py >= minY && py <= maxY) members.push(i);
    }
  } else {
    // Ellipse: vertices[0,1]=center, vertices[2,3]=(cx+rx,cy), vertices[4,5]=(cx,cy+ry)
    const cx = vertices[0]!;
    const cy = vertices[1]!;
    const rx = vertices.length >= 4 ? Math.abs(vertices[2]! - cx) : 1;
    const ry = vertices.length >= 6 ? Math.abs(vertices[5]! - cy) : 1;
    const rxSq = rx * rx;
    const rySq = ry * ry;
    if (rxSq > 0 && rySq > 0) {
      for (let i = 0; i < n; i++) {
        const dx = x[i]! - cx;
        const dy = y[i]! - cy;
        if (dx * dx / rxSq + dy * dy / rySq <= 1.0) members.push(i);
      }
    }
  }

  const memberIndices = new Uint32Array(members.length);
  for (let i = 0; i < members.length; i++) memberIndices[i] = members[i]!;
  return { type: 'gatePoints', id, memberIndices };
}

/** Ray-casting point-in-polygon */
function _pointInPolygon(
  px: number,
  py: number,
  vertices: Float32Array,
  nVerts: number,
): boolean {
  let inside = false;
  for (let i = 0, j = nVerts - 1; i < nVerts; j = i++) {
    const xi = vertices[i * 2]!;
    const yi = vertices[i * 2 + 1]!;
    const xj = vertices[j * 2]!;
    const yj = vertices[j * 2 + 1]!;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Differential Expression ───

/** Core DE computation: log2fc + Welch's t-test p-value for each gene */
function _computeDeCore(
  expression: Float32Array,
  nVars: number,
  indA: Uint32Array,
  indB: Uint32Array,
): { log2fc: Float32Array; pvals: Float32Array } {
  const nA = indA.length;
  const nB = indB.length;
  const log2fc = new Float32Array(nVars);
  const pvals = new Float32Array(nVars);

  for (let v = 0; v < nVars; v++) {
    // Means
    let sumA = 0, sumB = 0;
    for (let i = 0; i < nA; i++) sumA += expression[indA[i]! * nVars + v]!;
    for (let i = 0; i < nB; i++) sumB += expression[indB[i]! * nVars + v]!;
    const meanA = nA > 0 ? sumA / nA : 0;
    const meanB = nB > 0 ? sumB / nB : 0;

    log2fc[v] = Math.log2((meanA + 1e-9) / (meanB + 1e-9));

    if (nA < 2 || nB < 2) {
      pvals[v] = 1.0;
      continue;
    }

    // Variances (Welch)
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

    const tStat = (meanA - meanB) / Math.sqrt(se);

    // Welch–Satterthwaite degrees of freedom
    const df = (se * se) / (
      (seA * seA) / (nA - 1) +
      (seB * seB) / (nB - 1)
    );

    pvals[v] = _tTestPValue(tStat, df);
  }

  return { log2fc, pvals };
}

function rankGenes(
  req: Extract<AnalysisWorkerRequest, { type: 'rankGenes' }>,
): AnalysisWorkerResponse {
  const { id, expression, nVars, groupA, groupB } = req;
  const { log2fc, pvals } = _computeDeCore(expression, nVars, groupA, groupB);
  return { type: 'rankGenes', id, log2fc, pvals };
}

function computeDe(
  req: Extract<AnalysisWorkerRequest, { type: 'computeDe' }>,
): AnalysisWorkerResponse {
  const { id, expression, nVars, groupA, groupB } = req;
  const { log2fc, pvals } = _computeDeCore(expression, nVars, groupA, groupB);
  return { type: 'computeDe', id, log2fc, pvals };
}

// ─── Matrix subsetting ───

function subsetMatrix(
  req: Extract<AnalysisWorkerRequest, { type: 'subsetMatrix' }>,
): AnalysisWorkerResponse {
  const { id, expression, nVars, obsIndices } = req;
  const nOut = obsIndices.length;
  const matrix = new Float32Array(nOut * nVars);

  for (let i = 0; i < nOut; i++) {
    const srcRow = obsIndices[i]! * nVars;
    const dstRow = i * nVars;
    for (let v = 0; v < nVars; v++) {
      matrix[dstRow + v] = expression[srcRow + v]!;
    }
  }

  return { type: 'subsetMatrix', id, matrix };
}

// ─── Statistical helpers ───

function _tTestPValue(t: number, df: number): number {
  const absT = Math.abs(t);
  if (df <= 0 || !isFinite(absT)) return 1.0;

  if (df > 30) {
    return 2 * (1 - _normalCDF(absT));
  }

  const x = df / (df + t * t);
  return _incompleteBeta(x, df / 2, 0.5);
}

function _normalCDF(z: number): number {
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const p = 0.2316419;
  const tt = 1 / (1 + p * z);
  const poly = tt * (a1 + tt * (a2 + tt * (a3 + tt * (a4 + tt * a5))));
  return 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
}

function _incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lbeta = _logBeta(a, b);
  const frontFactor = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta) / a;

  if (x > (a + 1) / (a + b + 2)) {
    return 1 - _incompleteBeta(1 - x, b, a);
  }

  let h = 1;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  h = d;

  for (let m = 1; m <= 100; m++) {
    let aa = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= c * d;

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

function _logGamma(x: number): number {
  const g = 7;
  const coeff = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - _logGamma(1 - x);
  }
  x -= 1;
  let a = coeff[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += coeff[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// ─── Worker entry point ───

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<AnalysisWorkerRequest>): void => {
  try {
    const response = handleMessage(e.data);
    const transferables: ArrayBuffer[] = [];

    const collect = (arr?: ArrayBufferView): void => {
      if (arr?.buffer instanceof ArrayBuffer) transferables.push(arr.buffer);
    };

    if (response.type === 'gatePoints') {
      collect(response.memberIndices);
    } else if (response.type === 'rankGenes') {
      collect(response.log2fc);
      collect(response.pvals);
    } else if (response.type === 'subsetMatrix') {
      collect(response.matrix);
    } else if (response.type === 'computeDe') {
      collect(response.log2fc);
      collect(response.pvals);
    }

    ctx.postMessage(response, transferables as unknown as Transferable[]);
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      id: e.data.id,
      message: err instanceof Error ? err.message : String(err),
    } satisfies AnalysisWorkerResponse);
  }
};
