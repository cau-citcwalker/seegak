// ─── Charts ───────────────────────────────────────────────────────────────────
export { ScatterChart } from './ScatterChart.js';
export type { ScatterChartProps, ScatterChartHandle } from './ScatterChart.js';

export { BoxPlotChart } from './BoxPlotChart.js';
export type { BoxPlotChartProps, BoxPlotChartHandle } from './BoxPlotChart.js';

export { BarChart } from './BarChart.js';
export type { BarChartProps, BarChartHandle } from './BarChart.js';

export { PieChart } from './PieChart.js';
export type { PieChartProps, PieChartHandle } from './PieChart.js';

export { FeaturePlotChart } from './FeaturePlotChart.js';
export type { FeaturePlotChartProps, FeaturePlotChartHandle } from './FeaturePlotChart.js';

export { DotPlotChart } from './DotPlotChart.js';
export type { DotPlotChartProps, DotPlotChartHandle } from './DotPlotChart.js';

export { HeatmapChart } from './HeatmapChart.js';
export type { HeatmapChartProps, HeatmapChartHandle } from './HeatmapChart.js';

export { ViolinPlotChart } from './ViolinPlotChart.js';
export type { ViolinPlotChartProps, ViolinPlotChartHandle } from './ViolinPlotChart.js';

// Human Body Map
export { HumanBodyMap } from './HumanBodyMap.js';
export type { HumanBodyMapProps } from './HumanBodyMap.js';

// Hook
export { useChart } from './use-chart.js';

// ─── Genomics ─────────────────────────────────────────────────────────────────
export { VolcanoPlot } from './genomics/VolcanoPlot.js';
export type { VolcanoPlotProps, VolcanoPlotHandle } from './genomics/VolcanoPlot.js';

export { EnrichmentPlot } from './genomics/EnrichmentPlot.js';
export type { EnrichmentPlotProps, EnrichmentPlotHandle } from './genomics/EnrichmentPlot.js';

export { GenomicProfile } from './genomics/GenomicProfile.js';
export type { GenomicProfileProps, GenomicProfileHandle } from './genomics/GenomicProfile.js';

// ─── Spatial ──────────────────────────────────────────────────────────────────
export { SpatialView } from './spatial/SpatialView.js';
export type { SpatialViewProps, SpatialViewHandle } from './spatial/SpatialView.js';

// ─── Analysis ─────────────────────────────────────────────────────────────────
export { GatingPlot } from './analysis/GatingPlot.js';
export type { GatingPlotProps, GatingPlotHandle } from './analysis/GatingPlot.js';

export { ObsSetTree } from './analysis/ObsSetTree.js';
export type { ObsSetTreeProps } from './analysis/ObsSetTree.js';

export { ComparativeView } from './analysis/ComparativeView.js';
export type { ComparativeViewProps } from './analysis/ComparativeView.js';

// ─── 3D ───────────────────────────────────────────────────────────────────────
export { VolumeView } from './3d/VolumeView.js';
export type { VolumeViewProps, VolumeViewHandle } from './3d/VolumeView.js';

export { MeshView } from './3d/MeshView.js';
export type { MeshViewProps, MeshViewHandle } from './3d/MeshView.js';

export { Scatter3DView } from './3d/Scatter3DView.js';
export type { Scatter3DViewProps, Scatter3DViewHandle } from './3d/Scatter3DView.js';

// ─── Coordination ─────────────────────────────────────────────────────────────
export { CoordinationProvider, useCoordination } from './coordination/CoordinationProvider.js';

// ─── Data Loaders ─────────────────────────────────────────────────────────────
export { useAnnData } from './data-loaders/useAnnData.js';
export type { UseAnnDataResult } from './data-loaders/useAnnData.js';

// ─── Re-export commonly used types ────────────────────────────────────────────
export type {
  ScatterData, ScatterOptions, ScatterTooltipData, ScatterSelectEvent,
  BoxPlotData, BoxPlotGroup, BoxStats, BoxPlotOptions,
  BarChartData, BarGroup, StackedBarGroup, BarChartOptions,
  PieChartData, PieSlice, PieChartOptions,
  FeaturePlotData, FeaturePlotOptions,
  DotPlotData, DotPlotOptions,
  HeatmapData, HeatmapOptions, HeatmapNormalize,
  ViolinPlotData, ViolinPlotGroup, ViolinPlotOptions,
} from '@seegak/bio-charts';

export type {
  OrganData, BodyMapOptions, BodyMapEvent,
} from '@seegak/human-body-map';

export type {
  ColorScale, Vec2, Vec4, ToolType, SelectionEvent,
} from '@seegak/core';

export { VIRIDIS, PLASMA, INFERNO, DataWorker } from '@seegak/core';

export type {
  VolcanoData, VolcanoOptions,
  EnrichmentData, EnrichmentOptions,
  GenomicProfileData, GenomicProfileOptions, GenomicTrack,
} from '@seegak/genomics';

export type {
  SpatialData, SpatialCells, SpatialImage, SpatialMolecules, SpatialSegmentation,
  SpatialViewOptions, ChannelConfig,
} from '@seegak/spatial';

export type {
  GatingPlotData, GatingPlotOptions,
  Gate, GateNode,
  ObsSetNode, ObsSetSelection,
  ComparativeViewOptions, ComparisonGroup,
} from '@seegak/analysis';

export type {
  VolumeData, VolumeOptions,
  MeshData, MeshOptions,
  Scatter3DData, Scatter3DOptions,
} from '@seegak/3d';

export type { CoordinationSpec, CoordinationScope } from '@seegak/coordination';

export type {
  AnnDataSchema, EmbeddingSlice, ExpressionSlice, ObsCategorySlice,
} from '@seegak/data-loaders';
