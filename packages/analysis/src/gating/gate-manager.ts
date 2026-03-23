// ─── Types ───

export interface Gate {
  id: string;
  name: string;
  type: 'polygon' | 'rectangle' | 'ellipse';
  /** World-space polygon vertices as interleaved x,y pairs */
  vertices: Float32Array;
  xAxis: string;
  yAxis: string;
  color: string;
  parentGateId: string | null;
  memberIndices?: Uint32Array;
}

export interface GateNode {
  gate: Gate;
  children: GateNode[];
  memberCount: number;
}

// ─── Ray-casting point-in-polygon ───

function pointInPolygonVertices(
  px: number,
  py: number,
  vertices: Float32Array,
): boolean {
  const n = vertices.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i * 2]!;
    const yi = vertices[i * 2 + 1]!;
    const xj = vertices[j * 2]!;
    const yj = vertices[j * 2 + 1]!;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInRectangle(px: number, py: number, vertices: Float32Array): boolean {
  // Rectangle encoded as 4 corner vertices (x,y pairs): min-x/y → max-x/y
  if (vertices.length < 8) return false;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = vertices[i * 2]!;
    const y = vertices[i * 2 + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function pointInEllipse(px: number, py: number, vertices: Float32Array): boolean {
  // Ellipse encoded as 4 vertices: [cx, cy, rx, ry] packed as x,y pairs
  // vertices[0,1] = center, vertices[2,3] = (cx+rx, cy), vertices[4,5] = (cx, cy+ry)
  if (vertices.length < 4) return false;
  const cx = vertices[0]!;
  const cy = vertices[1]!;
  // Derive radii from vertex layout
  const rx = vertices.length >= 4 ? Math.abs(vertices[2]! - cx) : 1;
  const ry = vertices.length >= 6 ? Math.abs(vertices[5]! - cy) : 1;
  if (rx === 0 || ry === 0) return false;
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  return dx * dx + dy * dy <= 1.0;
}

// ─── GateManager ───

let _nextId = 1;

export class GateManager {
  private gates: Map<string, Gate>;
  private listeners: Set<() => void>;

  constructor() {
    this.gates = new Map();
    this.listeners = new Set();
  }

  addGate(gate: Omit<Gate, 'memberIndices'>): string {
    const id = gate.id || `gate-${_nextId++}`;
    const fullGate: Gate = { ...gate, id, memberIndices: undefined };
    this.gates.set(id, fullGate);
    this._notifyListeners();
    return id;
  }

  removeGate(id: string): void {
    if (this.gates.delete(id)) {
      this._notifyListeners();
    }
  }

  getGate(id: string): Gate | undefined {
    return this.gates.get(id);
  }

  getAllGates(): Gate[] {
    return Array.from(this.gates.values());
  }

  getPopulationTree(): GateNode[] {
    // Build tree from parentGateId links
    const roots: GateNode[] = [];
    const nodeMap = new Map<string, GateNode>();

    for (const gate of this.gates.values()) {
      nodeMap.set(gate.id, {
        gate,
        children: [],
        memberCount: gate.memberIndices?.length ?? 0,
      });
    }

    for (const [, node] of nodeMap) {
      const parentId = node.gate.parentGateId;
      if (parentId !== null && nodeMap.has(parentId)) {
        nodeMap.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /** Compute membership using point-in-gate test (synchronous, off main thread via worker in production) */
  computeMembers(gateId: string, x: Float32Array, y: Float32Array): Promise<Uint32Array> {
    const gate = this.gates.get(gateId);
    if (!gate) return Promise.resolve(new Uint32Array(0));

    return new Promise<Uint32Array>((resolve) => {
      // Yield to keep the UI responsive; real apps would use the analysis worker
      setTimeout(() => {
        const n = x.length;
        const members: number[] = [];
        const verts = gate.vertices;

        for (let i = 0; i < n; i++) {
          const px = x[i]!;
          const py = y[i]!;
          let inside = false;
          if (gate.type === 'polygon') {
            inside = pointInPolygonVertices(px, py, verts);
          } else if (gate.type === 'rectangle') {
            inside = pointInRectangle(px, py, verts);
          } else if (gate.type === 'ellipse') {
            inside = pointInEllipse(px, py, verts);
          }
          if (inside) members.push(i);
        }

        const result = new Uint32Array(members.length);
        for (let i = 0; i < members.length; i++) result[i] = members[i]!;

        // Store back on gate
        const storedGate = this.gates.get(gateId);
        if (storedGate) storedGate.memberIndices = result;

        resolve(result);
      }, 0);
    });
  }

  onChanged(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private _notifyListeners(): void {
    for (const cb of this.listeners) cb();
  }
}
