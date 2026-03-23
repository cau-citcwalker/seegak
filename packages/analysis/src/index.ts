// ─── Gating ───

export { GateManager } from './gating/gate-manager.js';
export type { Gate, GateNode } from './gating/gate-manager.js';

export { GatingPlot } from './gating/gating-plot.js';
export type { GatingPlotData, GatingPlotOptions } from './gating/gating-plot.js';

// ─── Obs Sets ───

export { ObsSetTree } from './obs-sets/obs-set-tree.js';
export type { ObsSetNode, ObsSetSelection } from './obs-sets/obs-set-tree.js';

// ─── Cell Assignment ───

export { CellAssignmentManager } from './cell-assignment/cell-type-scores.js';
export type {
  CellTypeScores,
  ProbabilisticAssignment,
} from './cell-assignment/cell-type-scores.js';

// ─── Comparative ───

export { ComparativeViewController } from './comparative/comparative-view.js';
export type {
  ComparisonGroup,
  ComparativeViewOptions,
} from './comparative/comparative-view.js';

// ─── Worker Protocol ───

export type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from './worker/analysis-worker-protocol.js';
