/**
 * Compute the convex hull of a 2D point set using Andrew's monotone chain algorithm.
 * Returns indices into the original arrays forming the hull in CCW order.
 */
export function convexHull2D(x: Float32Array, y: Float32Array, indices: number[]): number[] {
  if (indices.length < 3) return [...indices];

  // Sort by x, then by y
  const sorted = indices.slice().sort((a, b) => x[a]! - x[b]! || y[a]! - y[b]!);

  const cross = (o: number, a: number, b: number) =>
    (x[a]! - x[o]!) * (y[b]! - y[o]!) - (y[a]! - y[o]!) * (x[b]! - x[o]!);

  // Build lower hull
  const lower: number[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: number[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

/**
 * Compute convex hulls for each cluster label.
 * Returns a map of label → hull vertex positions as [x0,y0, x1,y1, ...].
 */
export function clusterHulls(
  x: Float32Array,
  y: Float32Array,
  labels: string[],
): Map<string, Float32Array> {
  // Group indices by label
  const groups = new Map<string, number[]>();
  for (let i = 0; i < labels.length; i++) {
    const lbl = labels[i]!;
    let arr = groups.get(lbl);
    if (!arr) { arr = []; groups.set(lbl, arr); }
    arr.push(i);
  }

  const result = new Map<string, Float32Array>();
  for (const [label, indices] of groups) {
    if (indices.length < 3) continue;
    const hullIdx = convexHull2D(x, y, indices);
    const hull = new Float32Array(hullIdx.length * 2);
    for (let i = 0; i < hullIdx.length; i++) {
      hull[i * 2] = x[hullIdx[i]!]!;
      hull[i * 2 + 1] = y[hullIdx[i]!]!;
    }
    result.set(label, hull);
  }

  return result;
}
