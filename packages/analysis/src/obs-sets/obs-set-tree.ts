// ─── Types ───

export interface ObsSetNode {
  name: string;
  color?: string;
  obsIndices?: Uint32Array;
  children?: ObsSetNode[];
}

export interface ObsSetSelection {
  selectedPaths: string[][];
}

// ─── Path helpers ───

function pathKey(path: string[]): string {
  return path.join('\x00');
}

function nodeAtPath(root: ObsSetNode, path: string[]): ObsSetNode | undefined {
  if (path.length === 0) return root;
  let current: ObsSetNode | undefined = root;
  for (const segment of path) {
    if (!current) return undefined;
    const children: ObsSetNode[] | undefined = current.children;
    if (!children) return undefined;
    const found: ObsSetNode | undefined = children.find((c: ObsSetNode) => c.name === segment);
    if (!found) return undefined;
    current = found;
  }
  return current;
}

function collectIndices(node: ObsSetNode): Uint32Array {
  if (!node.children || node.children.length === 0) {
    return node.obsIndices ?? new Uint32Array(0);
  }
  // Merge own indices with all descendant indices
  const parts: Uint32Array[] = [];
  if (node.obsIndices) parts.push(node.obsIndices);
  for (const child of node.children) {
    parts.push(collectIndices(child));
  }
  const total = parts.reduce((s, p) => s + p.length, 0);
  const merged = new Uint32Array(total);
  let offset = 0;
  for (const p of parts) {
    merged.set(p, offset);
    offset += p.length;
  }
  return merged;
}

// ─── ObsSetTree ───

export class ObsSetTree {
  private root: ObsSetNode;
  private selection: ObsSetSelection;
  private listeners: Set<(selection: ObsSetSelection) => void>;

  constructor(root: ObsSetNode) {
    this.root = root;
    this.selection = { selectedPaths: [] };
    this.listeners = new Set();
  }

  getRoot(): ObsSetNode {
    return this.root;
  }

  getNode(path: string[]): ObsSetNode | undefined {
    return nodeAtPath(this.root, path);
  }

  /** Select a node by path. Multi-select if append=true */
  select(path: string[], append = false): void {
    const key = pathKey(path);
    if (append) {
      const exists = this.selection.selectedPaths.some((p) => pathKey(p) === key);
      if (!exists) {
        this.selection = {
          selectedPaths: [...this.selection.selectedPaths, path],
        };
      }
    } else {
      this.selection = { selectedPaths: [path] };
    }
    this._notifyListeners();
  }

  deselect(path: string[]): void {
    const key = pathKey(path);
    this.selection = {
      selectedPaths: this.selection.selectedPaths.filter((p) => pathKey(p) !== key),
    };
    this._notifyListeners();
  }

  clearSelection(): void {
    this.selection = { selectedPaths: [] };
    this._notifyListeners();
  }

  getSelection(): ObsSetSelection {
    return this.selection;
  }

  /** Get all obs indices for selected nodes (union, deduplicated) */
  getSelectedIndices(): Uint32Array {
    const parts: Uint32Array[] = [];
    for (const path of this.selection.selectedPaths) {
      const node = nodeAtPath(this.root, path);
      if (node) parts.push(collectIndices(node));
    }
    if (parts.length === 0) return new Uint32Array(0);

    // Deduplicate using a Set
    const seen = new Set<number>();
    for (const part of parts) {
      for (let i = 0; i < part.length; i++) seen.add(part[i]!);
    }
    const result = new Uint32Array(seen.size);
    let i = 0;
    for (const v of seen) result[i++] = v;
    result.sort();
    return result;
  }

  /** Build from categorical obs column */
  static fromCategories(
    categories: string[],
    obsIndices: Record<string, Uint32Array>,
  ): ObsSetTree {
    const children: ObsSetNode[] = categories.map((cat) => ({
      name: cat,
      obsIndices: obsIndices[cat] ?? new Uint32Array(0),
    }));
    return new ObsSetTree({ name: 'Categories', children });
  }

  /** Build from Leiden/Louvain flat clustering */
  static fromFlatClustering(
    labels: string[],
    clusterColors?: Record<string, string>,
  ): ObsSetTree {
    // Group observation indices by cluster label
    const groupMap = new Map<string, number[]>();
    for (let i = 0; i < labels.length; i++) {
      const lbl = labels[i]!;
      if (!groupMap.has(lbl)) groupMap.set(lbl, []);
      groupMap.get(lbl)!.push(i);
    }

    // Sort cluster names naturally
    const sortedLabels = Array.from(groupMap.keys()).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    const children: ObsSetNode[] = sortedLabels.map((lbl) => {
      const indices = groupMap.get(lbl)!;
      return {
        name: lbl,
        color: clusterColors?.[lbl],
        obsIndices: new Uint32Array(indices),
      };
    });

    return new ObsSetTree({ name: 'Clustering', children });
  }

  onSelectionChanged(cb: (selection: ObsSetSelection) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private _notifyListeners(): void {
    for (const cb of this.listeners) cb(this.selection);
  }
}
