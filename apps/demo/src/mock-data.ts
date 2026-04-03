import type {
  ScatterData,
  BarChartData,
  PieChartData,
  BoxPlotData,
  ViolinPlotData,
  HeatmapData,
  DotPlotData,
  FeaturePlotData,
  Scatter3DData,
  VolumeData,
  MeshData,
  VolcanoData,
  EnrichmentData,
  GenomicProfileData,
  GatingPlotData,
  ObsSetNode,
  SpatialData,
  OrganData,
} from '@seegak/react';

// ─── Constants ──────────────────────────────────────────────

export const CLUSTER_COLORS = ['#4e8ef7', '#f97316', '#22c55e', '#a855f7', '#ec4899'];
export const CLUSTER_LABELS = ['T Cell', 'B Cell', 'NK Cell', 'Monocyte', 'Dendritic'];
const GENES = ['CD3D', 'CD19', 'NCAM1', 'CD14', 'FCER1A', 'CD68', 'MS4A1', 'GNLY', 'NKG7'];
const N = 3000;

// ─── Utils ──────────────────────────────────────────────────

function gaussian(mean: number, std: number): number {
  const u = Math.random() || 1e-10;
  const v = Math.random() || 1e-10;
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── Bio Charts ─────────────────────────────────────────────

export function makeScatterData(): ScatterData {
  const x = new Float32Array(N);
  const y = new Float32Array(N);
  const colors: string[] = [];
  const labels: string[] = [];

  const centers: [number, number][] = [[-3, 2], [3, 2], [0, -3], [-2, -1], [2, -1]];
  for (let i = 0; i < N; i++) {
    const c = i % 5;
    x[i] = gaussian(centers[c][0], 0.9);
    y[i] = gaussian(centers[c][1], 0.9);
    colors.push(CLUSTER_COLORS[c]);
    labels.push(CLUSTER_LABELS[c]);
  }
  return { x, y, colors, labels };
}

export const barData: BarChartData = {
  groups: CLUSTER_LABELS.map((label, i) => ({
    label,
    values: [Math.floor(80 + Math.random() * 200)],
    color: CLUSTER_COLORS[i],
  })),
  valueLabels: ['Cell Count'],
};

export const pieData: PieChartData = {
  slices: CLUSTER_LABELS.map((label, i) => ({
    label,
    value: Math.floor(80 + Math.random() * 200),
    color: CLUSTER_COLORS[i],
  })),
};

export const boxData: BoxPlotData = {
  groups: CLUSTER_LABELS.map((label, i) => ({
    label,
    values: Array.from({ length: 80 }, () => Math.max(0, gaussian(i * 0.6 + 1.5, 1.2))),
    color: CLUSTER_COLORS[i],
  })),
  yLabel: 'Expression (log1p)',
};

export const violinData: ViolinPlotData = {
  groups: CLUSTER_LABELS.map((label, i) => ({
    label,
    values: Array.from({ length: 120 }, () => Math.max(0, gaussian(i * 0.6 + 1.5, 1.0))),
    color: CLUSTER_COLORS[i],
  })),
  yLabel: 'Expression (log1p)',
};

// ─── Expression ─────────────────────────────────────────────

export function makeHeatmapData(): HeatmapData {
  const genes = GENES;
  const rows = CLUSTER_LABELS;
  const expression = new Float32Array(rows.length * genes.length);
  for (let r = 0; r < rows.length; r++) {
    for (let g = 0; g < genes.length; g++) {
      const isMarker = g === r || g === (r + 1) % genes.length;
      expression[r * genes.length + g] = Math.max(0, gaussian(isMarker ? 3.5 : 0.5, 0.7));
    }
  }
  return { genes, rows, expression };
}

export function makeDotPlotData(): DotPlotData {
  const genes = GENES.slice(0, 6);
  const clusters = CLUSTER_LABELS;
  const meanExpression = new Float32Array(clusters.length * genes.length);
  const fractionExpressing = new Float32Array(clusters.length * genes.length);
  for (let c = 0; c < clusters.length; c++) {
    for (let g = 0; g < genes.length; g++) {
      const isMarker = g === c || g === (c + 1) % genes.length;
      meanExpression[c * genes.length + g] = Math.max(0, gaussian(isMarker ? 3.2 : 0.4, 0.5));
      fractionExpressing[c * genes.length + g] = isMarker
        ? 0.65 + Math.random() * 0.3
        : Math.random() * 0.25;
    }
  }
  return { genes, clusters, meanExpression, fractionExpressing };
}

export function makeFeaturePlotData(scatter: ScatterData): FeaturePlotData {
  const expression = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // T Cells (every 5th starting at 0) have high CD3D expression
    const isT = i % 5 === 0;
    expression[i] = Math.max(0, gaussian(isT ? 3.5 : 0.3, 0.8));
  }
  return { x: scatter.x, y: scatter.y, expression, geneName: 'CD3D' };
}

// ─── 3D ─────────────────────────────────────────────────────

export function makeScatter3DData(): Scatter3DData {
  const x = new Float32Array(N);
  const y = new Float32Array(N);
  const z = new Float32Array(N);
  const colors: string[] = [];
  const labels: string[] = [];

  // Spread clusters far apart so each appears as a distinct small blob (like seegak 3D view)
  const centers: [number, number, number][] = [
    [-9, 6, 0], [0, 6, 0], [9, 6, 0],
    [-5, -4, 0], [5, -4, 0],
  ];
  for (let i = 0; i < N; i++) {
    const c = i % 5;
    x[i] = gaussian(centers[c][0], 0.8);
    y[i] = gaussian(centers[c][1], 0.8);
    z[i] = gaussian(centers[c][2], 0.8);
    colors.push(CLUSTER_COLORS[c]);
    labels.push(CLUSTER_LABELS[c]);
  }
  return { x, y, z, colors, labels };
}

export function makeVolumeData(): VolumeData {
  const W = 32, H = 32, D = 32;
  const buf = new Uint8Array(W * H * D);
  const sigma = 7;
  for (let z = 0; z < D; z++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - 16, dy = y - 16, dz = z - 16;
        const r2 = dx * dx + dy * dy + dz * dz;
        buf[z * W * H + y * W + x] = Math.round(Math.exp(-r2 / (2 * sigma * sigma)) * 255);
      }
    }
  }
  return { buffer: buf.buffer, width: W, height: H, depth: D, dtype: 'uint8' };
}

export function makeMeshData(): MeshData {
  // UV sphere
  const stacks = 14, slices = 18;
  const verts: number[] = [];
  const norms: number[] = [];
  const idxs: number[] = [];

  for (let i = 0; i <= stacks; i++) {
    const phi = (Math.PI * i) / stacks;
    for (let j = 0; j <= slices; j++) {
      const theta = (2 * Math.PI * j) / slices;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      verts.push(x, y, z);
      norms.push(x, y, z);
    }
  }
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j;
      const b = a + slices + 1;
      idxs.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idxs),
    normals: new Float32Array(norms),
  };
}

// ─── Genomics ────────────────────────────────────────────────

export function makeVolcanoData(): VolcanoData {
  const M = 400;
  const x = new Float32Array(M);
  const y = new Float32Array(M);
  const geneIds: string[] = [];

  for (let i = 0; i < M; i++) {
    x[i] = gaussian(0, 2.5);
    y[i] = Math.max(0, -Math.log10(Math.random() * 0.1));
    geneIds.push(`GENE${i + 1}`);
  }
  return { x, y, geneIds, labels: ['GENE1', 'GENE5', 'GENE12', 'GENE30', 'GENE55'] };
}

export function makeEnrichmentData(): EnrichmentData {
  const totalGenes = 500;
  const setSize = 60;

  const hitArr = Array.from({ length: setSize }, (_, i) =>
    Math.min(totalGenes - 1, Math.floor(i * 7 + Math.random() * 5)),
  ).sort((a, b) => a - b);
  const hitPositions = new Uint32Array(hitArr);

  const runningScore = new Float32Array(totalGenes);
  const hitSet = new Set(hitArr);
  const stepHit = 1 / setSize;
  const stepMiss = -1 / (totalGenes - setSize);
  let score = 0;
  for (let i = 0; i < totalGenes; i++) {
    score += hitSet.has(i) ? stepHit : stepMiss;
    runningScore[i] = score;
  }

  return {
    runningScore,
    hitPositions,
    totalGenes,
    geneSetName: 'HALLMARK_T_CELL_ACTIVATION',
    es: 0.62,
    nes: 1.85,
    pval: 0.003,
    fdr: 0.021,
  };
}

export function makeGenomicProfileData(): GenomicProfileData {
  const start = 1_000_000;
  const end = 2_000_000;
  const binSize = 5000;
  const bins = Math.floor((end - start) / binSize);

  const values = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    values[i] = Math.max(0, gaussian(10, 8));
  }
  // Add three peaks
  ([0.2, 0.5, 0.75] as const).forEach((pos, pi) => {
    const center = Math.floor(bins * pos);
    const height = [120, 80, 100][pi];
    for (let i = -15; i <= 15; i++) {
      const idx = center + i;
      if (idx >= 0 && idx < bins) {
        values[idx] += height * Math.exp((-i * i) / 40);
      }
    }
  });

  return {
    chrom: 'chr1',
    start,
    end,
    values,
    binSize,
    tracks: [
      {
        label: 'Genes',
        regions: [
          { start: 1_100_000, end: 1_220_000, strand: '+' as const },
          { start: 1_430_000, end: 1_560_000, strand: '-' as const },
          { start: 1_700_000, end: 1_860_000, strand: '+' as const },
        ],
      },
    ],
  };
}

// ─── Analysis ────────────────────────────────────────────────

export function makeGatingData(): GatingPlotData {
  const M = 600;
  const x = new Float32Array(M);
  const y = new Float32Array(M);

  for (let i = 0; i < M; i++) {
    if (i < 240) {
      x[i] = Math.max(0, gaussian(200, 45));  // Lymphocytes
      y[i] = Math.max(0, gaussian(100, 35));
    } else if (i < 420) {
      x[i] = Math.max(0, gaussian(420, 65));  // Monocytes
      y[i] = Math.max(0, gaussian(260, 55));
    } else {
      x[i] = Math.max(0, gaussian(650, 80));  // Granulocytes
      y[i] = Math.max(0, gaussian(460, 70));
    }
  }
  return { x, y, xLabel: 'FSC-A', yLabel: 'SSC-A' };
}

export const obsSetTree: ObsSetNode = {
  name: 'All Cells (940)',
  children: [
    {
      name: 'Lymphoid',
      children: [
        {
          name: 'T Cell',
          color: '#4e8ef7',
          obsIndices: new Uint32Array(Array.from({ length: 320 }, (_, i) => i)),
        },
        {
          name: 'B Cell',
          color: '#f97316',
          obsIndices: new Uint32Array(Array.from({ length: 180 }, (_, i) => 320 + i)),
        },
        {
          name: 'NK Cell',
          color: '#22c55e',
          obsIndices: new Uint32Array(Array.from({ length: 220 }, (_, i) => 500 + i)),
        },
      ],
    },
    {
      name: 'Myeloid',
      children: [
        {
          name: 'Monocyte',
          color: '#a855f7',
          obsIndices: new Uint32Array(Array.from({ length: 140 }, (_, i) => 720 + i)),
        },
        {
          name: 'Dendritic',
          color: '#ec4899',
          obsIndices: new Uint32Array(Array.from({ length: 80 }, (_, i) => 860 + i)),
        },
      ],
    },
  ],
};

// ─── Spatial ─────────────────────────────────────────────────

export function makeSpatialData(): SpatialData {
  const M = 600;
  const x = new Float32Array(M);
  const y = new Float32Array(M);
  const labels: string[] = [];
  const colors: string[] = [];

  for (let i = 0; i < M; i++) {
    x[i] = Math.random() * 1000;
    y[i] = Math.random() * 1000;
    const c = i % 5;
    labels.push(CLUSTER_LABELS[c]);
    colors.push(CLUSTER_COLORS[c]);
  }
  return { cells: { x, y, labels, colors }, bounds: [0, 0, 1000, 1000] };
}

// ─── Human Body Map ──────────────────────────────────────────

export const bodyMapData: Record<string, OrganData> = {
  heart:        { datasetCount: 5,  cellCount: 12_000, sampleCount: 8  },
  liver:        { datasetCount: 12, cellCount: 45_000, sampleCount: 20 },
  'lung-left':  { datasetCount: 8,  cellCount: 28_000, sampleCount: 15 },
  'lung-right': { datasetCount: 8,  cellCount: 28_000, sampleCount: 15 },
  'kidney-left':  { datasetCount: 6, cellCount: 18_000, sampleCount: 10 },
  'kidney-right': { datasetCount: 6, cellCount: 18_000, sampleCount: 10 },
  brain:   { datasetCount: 15, cellCount: 85_000, sampleCount: 30 },
  stomach: { datasetCount: 4,  cellCount:  9_000, sampleCount: 6  },
  spleen:  { datasetCount: 7,  cellCount: 22_000, sampleCount: 12 },
  pancreas: { datasetCount: 3, cellCount:  7_000, sampleCount: 5  },
};
