/**
 * Protocol for main thread ↔ analysis worker communication.
 * Uses typed messages and transferable ArrayBuffers for zero-copy transfers.
 */

export type AnalysisWorkerRequest =
  | {
      type: 'gatePoints';
      id: number;
      vertices: Float32Array;
      x: Float32Array;
      y: Float32Array;
      gateType: 'polygon' | 'rectangle' | 'ellipse';
    }
  | {
      type: 'rankGenes';
      id: number;
      expression: Float32Array;
      nObs: number;
      nVars: number;
      groupA: Uint32Array;
      groupB: Uint32Array;
    }
  | {
      type: 'subsetMatrix';
      id: number;
      expression: Float32Array;
      nObs: number;
      nVars: number;
      obsIndices: Uint32Array;
    }
  | {
      type: 'computeDe';
      id: number;
      expression: Float32Array;
      nObs: number;
      nVars: number;
      groupA: Uint32Array;
      groupB: Uint32Array;
    };

export type AnalysisWorkerResponse =
  | { type: 'gatePoints'; id: number; memberIndices: Uint32Array }
  | { type: 'rankGenes'; id: number; log2fc: Float32Array; pvals: Float32Array }
  | { type: 'subsetMatrix'; id: number; matrix: Float32Array }
  | { type: 'computeDe'; id: number; log2fc: Float32Array; pvals: Float32Array }
  | { type: 'error'; id: number; message: string };
