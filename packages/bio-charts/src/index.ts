// Base
export { BaseChart } from './base-chart.js';
export type { BaseChartOptions, ChartMargin } from './base-chart.js';

// Charts
export { ScatterChart } from './charts/scatter.js';
export type { ScatterData, ScatterOptions, ScatterTooltipData, ScatterSelectEvent } from './charts/scatter.js';

export { BoxPlotChart } from './charts/boxplot.js';
export type { BoxPlotData, BoxPlotGroup, BoxStats, BoxPlotOptions } from './charts/boxplot.js';

export { BarChart } from './charts/bar.js';
export type { BarChartData, BarGroup, StackedBarGroup, BarChartOptions } from './charts/bar.js';

export { PieChart } from './charts/pie.js';
export type { PieChartData, PieSlice, PieChartOptions } from './charts/pie.js';

export { FeaturePlotChart } from './charts/feature-plot.js';
export type { FeaturePlotData, FeaturePlotOptions } from './charts/feature-plot.js';

export { DotPlotChart } from './charts/dot-plot.js';
export type { DotPlotData, DotPlotOptions } from './charts/dot-plot.js';

export { HeatmapChart } from './charts/heatmap.js';
export type { HeatmapData, HeatmapOptions, HeatmapNormalize } from './charts/heatmap.js';

export { ViolinPlotChart } from './charts/violin.js';
export type { ViolinPlotData, ViolinPlotOptions, ViolinPlotGroup } from './charts/violin.js';

// Renderer helpers
export type { ClusterEntry, CellLegendOptions } from './renderer/cell-legend.js';
