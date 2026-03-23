/**
 * Genomics worker implementation.
 * Runs in a Web Worker context — no DOM access.
 */
import type { GenomicsWorkerRequest, GenomicsWorkerResponse } from './genomics-worker-protocol.js';

// ─── classifyVolcano ───

function classifyVolcano(
  x: Float32Array,
  y: Float32Array,
  log2fcThresh: number,
  pvalThresh: number,
): Uint8Array {
  const n = x.length;
  const significant = new Uint8Array(n);
  // Pre-compute the -log10(pvalThresh) threshold on the y-axis
  const negLog10Pval = -Math.log10(pvalThresh);

  for (let i = 0; i < n; i++) {
    const xi = x[i]!;
    const yi = y[i]!;
    if (xi > log2fcThresh && yi >= negLog10Pval) {
      significant[i] = 1; // up-regulated
    } else if (xi < -log2fcThresh && yi >= negLog10Pval) {
      significant[i] = 2; // down-regulated
    } else {
      significant[i] = 0; // not significant
    }
  }

  return significant;
}

// ─── binProfile ───

function binProfile(
  positions: Uint32Array,
  values: Float32Array,
  binSize: number,
  regionStart: number,
  regionEnd: number,
): Float32Array {
  const regionLen = regionEnd - regionStart;
  const binCount = Math.max(1, Math.ceil(regionLen / binSize));
  const binned = new Float32Array(binCount);
  const counts = new Uint32Array(binCount);

  const n = positions.length;
  for (let i = 0; i < n; i++) {
    const pos = positions[i]!;
    if (pos < regionStart || pos >= regionEnd) continue;
    const binIdx = Math.floor((pos - regionStart) / binSize);
    if (binIdx >= 0 && binIdx < binCount) {
      binned[binIdx] += values[i]!;
      counts[binIdx]++;
    }
  }

  // Average the values within each bin
  for (let b = 0; b < binCount; b++) {
    if (counts[b]! > 0) {
      binned[b] = binned[b]! / counts[b]!;
    }
  }

  return binned;
}

// ─── Message Handler ───

self.onmessage = (event: MessageEvent<GenomicsWorkerRequest>) => {
  const req = event.data;

  try {
    switch (req.type) {
      case 'classifyVolcano': {
        const significant = classifyVolcano(req.x, req.y, req.log2fcThresh, req.pvalThresh);
        const response: GenomicsWorkerResponse = {
          type: 'classifyVolcano',
          id: req.id,
          significant,
        };
        (self as unknown as Worker).postMessage(response, [significant.buffer]);
        break;
      }
      case 'binProfile': {
        const binned = binProfile(
          req.positions,
          req.values,
          req.binSize,
          req.regionStart,
          req.regionEnd,
        );
        const response: GenomicsWorkerResponse = {
          type: 'binProfile',
          id: req.id,
          binned,
        };
        (self as unknown as Worker).postMessage(response, [binned.buffer]);
        break;
      }
      default: {
        const _exhaustive: never = req;
        void _exhaustive;
      }
    }
  } catch (err) {
    const response: GenomicsWorkerResponse = {
      type: 'error',
      id: (req as { id: number }).id,
      message: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
