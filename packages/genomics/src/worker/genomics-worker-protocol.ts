/**
 * Protocol for main thread ↔ genomics worker communication.
 * Uses typed messages and transferable ArrayBuffers for zero-copy transfers.
 */

export type GenomicsWorkerRequest =
  | {
      type: 'classifyVolcano';
      id: number;
      x: Float32Array;
      y: Float32Array;
      log2fcThresh: number;
      pvalThresh: number;
    }
  | {
      type: 'binProfile';
      id: number;
      positions: Uint32Array;
      values: Float32Array;
      binSize: number;
      regionStart: number;
      regionEnd: number;
    };

export type GenomicsWorkerResponse =
  | { type: 'classifyVolcano'; id: number; significant: Uint8Array }
  | { type: 'binProfile'; id: number; binned: Float32Array }
  | { type: 'error'; id: number; message: string };
