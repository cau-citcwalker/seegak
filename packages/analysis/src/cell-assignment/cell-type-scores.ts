// ─── Types ───

export interface CellTypeScores {
  cellIndices: Uint32Array;
  cellTypeNames: string[];
  /** nCells × nCellTypes matrix, row-major */
  scores: Float32Array;
}

export interface ProbabilisticAssignment {
  cellIndex: number;
  assignments: Array<{ cellType: string; probability: number }>;
}

// ─── Softmax helper ───

function softmax(values: Float32Array, start: number, length: number): Float32Array {
  const out = new Float32Array(length);
  let maxVal = -Infinity;
  for (let i = 0; i < length; i++) {
    const v = values[start + i]!;
    if (v > maxVal) maxVal = v;
  }
  let sum = 0;
  for (let i = 0; i < length; i++) {
    out[i] = Math.exp(values[start + i]! - maxVal);
    sum += out[i]!;
  }
  if (sum > 0) {
    for (let i = 0; i < length; i++) out[i] = out[i]! / sum;
  }
  return out;
}

// ─── CellAssignmentManager ───

export class CellAssignmentManager {
  private scores: CellTypeScores;
  private nCells: number;
  private nTypes: number;

  constructor(scores: CellTypeScores) {
    this.scores = scores;
    this.nCells = scores.cellIndices.length;
    this.nTypes = scores.cellTypeNames.length;
  }

  /** Get top assignment for each cell (returns one entry per cell) */
  getTopAssignments(): Array<{ cellType: string; probability: number }> {
    const result: Array<{ cellType: string; probability: number }> = [];
    const nT = this.nTypes;

    for (let c = 0; c < this.nCells; c++) {
      const probs = softmax(this.scores.scores, c * nT, nT);
      let bestIdx = 0;
      let bestProb = probs[0]!;
      for (let t = 1; t < nT; t++) {
        if (probs[t]! > bestProb) {
          bestProb = probs[t]!;
          bestIdx = t;
        }
      }
      result.push({
        cellType: this.scores.cellTypeNames[bestIdx]!,
        probability: bestProb,
      });
    }

    return result;
  }

  /** Get full probability distribution for a single cell */
  getCellProbabilities(cellIndex: number): ProbabilisticAssignment {
    // Resolve logical cell index to row position
    const rowPos = this.scores.cellIndices.indexOf(cellIndex);
    const row = rowPos >= 0 ? rowPos : cellIndex;

    const nT = this.nTypes;
    const probs = softmax(this.scores.scores, row * nT, nT);
    const assignments = this.scores.cellTypeNames.map((cellType, t) => ({
      cellType,
      probability: probs[t]!,
    }));
    assignments.sort((a, b) => b.probability - a.probability);

    return { cellIndex, assignments };
  }

  /** Get all cells above threshold for a cell type */
  getCellsForType(cellType: string, minProbability = 0.5): Uint32Array {
    const typeIdx = this.scores.cellTypeNames.indexOf(cellType);
    if (typeIdx < 0) return new Uint32Array(0);

    const nT = this.nTypes;
    const matching: number[] = [];

    for (let c = 0; c < this.nCells; c++) {
      const probs = softmax(this.scores.scores, c * nT, nT);
      if ((probs[typeIdx] ?? 0) >= minProbability) {
        matching.push(this.scores.cellIndices[c]!);
      }
    }

    return new Uint32Array(matching);
  }

  /** Get summary statistics per cell type */
  getSummary(): Array<{ cellType: string; count: number; meanScore: number }> {
    const nT = this.nTypes;
    const counts = new Int32Array(nT);
    const sumProbs = new Float64Array(nT);

    for (let c = 0; c < this.nCells; c++) {
      const probs = softmax(this.scores.scores, c * nT, nT);
      // Count each cell toward the top type only
      let bestIdx = 0;
      let bestProb = probs[0]!;
      for (let t = 1; t < nT; t++) {
        if (probs[t]! > bestProb) {
          bestProb = probs[t]!;
          bestIdx = t;
        }
      }
      counts[bestIdx]++;
      for (let t = 0; t < nT; t++) {
        sumProbs[t] += probs[t]!;
      }
    }

    return this.scores.cellTypeNames.map((cellType, t) => ({
      cellType,
      count: counts[t]!,
      meanScore: this.nCells > 0 ? sumProbs[t]! / this.nCells : 0,
    }));
  }
}
