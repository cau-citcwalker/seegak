/**
 * Hit test helpers for pixel-space charts (BoxPlot, Bar, Pie).
 * These charts render in CSS pixel coordinates, so hit testing
 * is done by inverse-mapping mouse position → data group.
 */

import type { ChartMargin } from '../base-chart.js';

export interface PlotArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getPlotArea(
  containerWidth: number,
  containerHeight: number,
  margin: ChartMargin,
): PlotArea {
  return {
    x: margin.left,
    y: margin.top,
    width: containerWidth - margin.left - margin.right,
    height: containerHeight - margin.top - margin.bottom,
  };
}

/**
 * For bar/boxplot: find which group index the mouse is over.
 * @param pos      Mouse position along the group axis (x for vertical, y for horizontal)
 * @param axisStart Plot area start on that axis
 * @param axisSize  Plot area size on that axis
 * @param groupCount Number of groups
 * @returns group index (0-based), or -1 if outside
 */
export function hitTestGroup(
  pos: number,
  axisStart: number,
  axisSize: number,
  groupCount: number,
): number {
  if (pos < axisStart || pos > axisStart + axisSize) return -1;
  const relative = pos - axisStart;
  const idx = Math.floor((relative / axisSize) * groupCount);
  return Math.max(0, Math.min(groupCount - 1, idx));
}

/**
 * For pie: find which slice the mouse is over.
 * @param mouseX   Mouse x relative to container
 * @param mouseY   Mouse y relative to container
 * @param cx       Pie center x
 * @param cy       Pie center y
 * @param radius   Outer radius
 * @param innerRadius  Inner radius (0 for full pie)
 * @param sliceAngles  [startAngle, endAngle] for each slice (radians)
 */
export function hitTestPieSlice(
  mouseX: number,
  mouseY: number,
  cx: number,
  cy: number,
  radius: number,
  innerRadius: number,
  sliceAngles: Array<[number, number]>,
): number {
  const dx = mouseX - cx;
  const dy = mouseY - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > radius || dist < innerRadius) return -1;

  // atan2 returns angle in [-π, π], we start from -π/2
  let angle = Math.atan2(dy, dx);

  for (let i = 0; i < sliceAngles.length; i++) {
    let [start, end] = sliceAngles[i];
    // Normalize angle into slice range
    while (angle < start) angle += Math.PI * 2;
    while (angle > end + Math.PI * 2) angle -= Math.PI * 2;
    if (angle >= start && angle <= end) return i;
  }

  return -1;
}
