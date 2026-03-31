import { useMemo, useState } from 'react';
import {
  // Bio Charts
  ScatterChart,
  BarChart,
  PieChart,
  BoxPlotChart,
  ViolinPlotChart,
  // Expression
  HeatmapChart,
  DotPlotChart,
  FeaturePlotChart,
  // 3D
  Scatter3DView,
  VolumeView,
  MeshView,
  // Genomics
  VolcanoPlot,
  EnrichmentPlot,
  GenomicProfile,
  // Analysis
  GatingPlot,
  ObsSetTree,
  // Spatial & Body
  SpatialView,
  HumanBodyMap,
} from '@seegak/react';
import type { ObsSetSelection, BodyMapEvent } from '@seegak/react';

import {
  makeScatterData,
  makeScatter3DData,
  barData,
  pieData,
  boxData,
  violinData,
  makeHeatmapData,
  makeDotPlotData,
  makeFeaturePlotData,
  makeVolumeData,
  makeMeshData,
  makeVolcanoData,
  makeEnrichmentData,
  makeGenomicProfileData,
  makeGatingData,
  obsSetTree,
  makeSpatialData,
  bodyMapData,
} from './mock-data';

// ─── Types ───────────────────────────────────────────────────

type Section =
  | 'bio'
  | '3d'
  | 'genomics'
  | 'analysis'
  | 'spatial'
  | 'bodymap';

interface NavItem {
  id: Section;
  label: string;
  icon: string;
  desc: string;
}

// ─── Constants ───────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: 'bio',        icon: '◎', label: 'Bio Charts',    desc: 'Scatter · Bar · Pie · Box · Violin · Heatmap · DotPlot · FeaturePlot' },
  { id: '3d',         icon: '⬡', label: '3D',            desc: 'Scatter3D · Volume · Mesh'             },
  { id: 'genomics',   icon: '⬙', label: 'Genomics',      desc: 'Volcano · Enrichment · Profile'        },
  { id: 'analysis',   icon: '⬥', label: 'Analysis',      desc: 'Gating · ObsSet Tree'                  },
  { id: 'spatial',    icon: '⊹', label: 'Spatial',       desc: 'Spatial transcriptomics view'          },
  { id: 'bodymap',    icon: '♡', label: 'Body Map',      desc: 'Interactive human organ map'           },
];

// ─── ChartCard ───────────────────────────────────────────────

function ChartCard({
  title,
  desc,
  height = 340,
  children,
}: {
  title: string;
  desc?: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-card border border-border flex flex-col overflow-hidden"
      style={{ borderRadius: 'var(--radius-frame)' }}
    >
      <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <div style={{ height, position: 'relative', flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────

function Header({
  section,
  onMenuClick,
}: {
  section: Section;
  onMenuClick: () => void;
}) {
  const item = NAV_ITEMS.find((n) => n.id === section)!;
  return (
    <header
      className="flex items-center gap-4 px-6 border-b border-border bg-card flex-shrink-0"
      style={{ height: 'var(--header-height)' }}
    >
      <button
        onClick={onMenuClick}
        className="flex flex-col gap-[5px] p-1.5 rounded hover:bg-secondary transition-colors"
        title="Toggle sidebar"
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="block w-4 h-0.5 bg-foreground/50 rounded" />
        ))}
      </button>

      <span
        className="font-bold text-lg tracking-tight"
        style={{ color: 'hsl(var(--primary))' }}
      >
        K-MAP
      </span>
      <span className="text-sm text-muted-foreground">×</span>
      <span className="text-sm font-medium text-foreground">seegak demo</span>

      <div className="w-px h-5 bg-border mx-1" />

      <span className="text-sm font-medium text-foreground">{item.label}</span>
      <span className="text-xs text-muted-foreground">{item.desc}</span>

      <div className="flex-1" />
      <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground font-medium">
        kmap-style
      </span>
    </header>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────

function Sidebar({
  collapsed,
  section,
  onSelect,
}: {
  collapsed: boolean;
  section: Section;
  onSelect: (s: Section) => void;
}) {
  return (
    <aside
      className="flex flex-col border-r border-sidebar-border bg-sidebar overflow-hidden transition-all duration-200 flex-shrink-0"
      style={{ width: collapsed ? 0 : 'var(--sidebar-width)' }}
    >
      <div style={{ width: 'var(--sidebar-width)' }}>
        <p className="px-4 pt-5 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Visualizations
        </p>
        <nav className="px-2 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.id === section;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={[
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left w-full transition-colors',
                  active
                    ? 'font-semibold'
                    : 'text-sidebar-foreground/80 hover:bg-white/60 hover:text-sidebar-foreground',
                ].join(' ')}
                style={
                  active
                    ? {
                        background: 'white',
                        color: 'hsl(var(--sidebar-primary))',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      }
                    : undefined
                }
              >
                <span className="text-base w-5 text-center opacity-60 flex-shrink-0">
                  {item.icon}
                </span>
                <div className="min-w-0">
                  <p className="leading-tight">{item.label}</p>
                  <p className="text-xs font-normal opacity-60 truncate leading-tight mt-0.5">
                    {item.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="mx-4 mt-4 mb-3 h-px bg-sidebar-border" />
        <div className="px-4 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Dataset
          </p>
          <p className="text-xs text-muted-foreground">PBMC 3k · 10x Genomics</p>
          <p className="text-xs text-muted-foreground">940 cells · 5 clusters</p>
        </div>
      </div>
    </aside>
  );
}

// ─── Sections ────────────────────────────────────────────────

function BioSection() {
  const scatter = useMemo(() => makeScatterData(), []);
  const zCoords = useMemo(() => makeScatter3DData().z, []);
  const heatmap = useMemo(() => makeHeatmapData(), []);
  const dotplot = useMemo(() => makeDotPlotData(), []);
  const feature = useMemo(() => makeFeaturePlotData(scatter), [scatter]);

  return (
    <div className="grid gap-5">
      {/* Cell Type UMAP Clustering — full width */}
      <ChartCard
        title="Cell Type UMAP Clustering"
        desc="2D projection · pan, lasso-select, box-select · 2D/3D toggle"
        height={420}
      >
        <ScatterChart
          data={scatter}
          z={zCoords}
          enable3D
          pointSize={4}
          opacity={0.82}
          autoFit
          toolbar
          toolbarPreset="standard"
          legend
          xLabel="UMAP 1"
          yLabel="UMAP 2"
        />
      </ChartCard>

      {/* Bar + Pie */}
      <div className="grid grid-cols-2 gap-5">
        <ChartCard title="Cell Type Composition" desc="Bar chart · per-cluster cell count">
          <BarChart data={barData} barWidth={0.6} tooltip toolbar />
        </ChartCard>
        <ChartCard title="Cluster Distribution" desc="Pie chart · proportional breakdown">
          <PieChart data={pieData} showLabels showPercentage tooltip />
        </ChartCard>
      </div>

      {/* Box + Violin */}
      <div className="grid grid-cols-2 gap-5">
        <ChartCard title="Gene Expression — Box Plot" desc="CD3D · per-cluster distribution">
          <BoxPlotChart data={boxData} showOutliers tooltip toolbar />
        </ChartCard>
        <ChartCard title="Gene Expression — Violin Plot" desc="CD3D · KDE density distribution">
          <ViolinPlotChart data={violinData} showBox tooltip />
        </ChartCard>
      </div>

      {/* Heatmap — full width */}
      <ChartCard
        title="Gene × Cluster Heatmap"
        desc="9 marker genes · 5 clusters · z-score normalized"
        height={320}
      >
        <HeatmapChart data={heatmap} tooltip />
      </ChartCard>

      {/* DotPlot + FeaturePlot */}
      <div className="grid grid-cols-2 gap-5">
        <ChartCard
          title="Dot Plot"
          desc="Mean expression (color) + fraction expressing (size)"
          height={340}
        >
          <DotPlotChart data={dotplot} tooltip />
        </ChartCard>
        <ChartCard
          title="Feature Plot — CD3D"
          desc="Continuous gene expression overlaid on UMAP"
          height={340}
        >
          <FeaturePlotChart
            data={feature}
            pointSize={4}
            opacity={0.85}
            autoFit
            tooltip
            toolbar
          />
        </ChartCard>
      </div>
    </div>
  );
}

function ThreeDSection() {
  const scatter = useMemo(() => makeScatterData(), []);
  const scatter3d = useMemo(() => makeScatter3DData(), []);
  const volume = useMemo(() => makeVolumeData(), []);
  const mesh = useMemo(() => makeMeshData(), []);
  // z coords for ScatterChart toggle
  const zCoords = useMemo(() => scatter3d.z, [scatter3d]);

  return (
    <div className="grid gap-5">
      {/* ScatterChart with 2D/3D toggle */}
      <ChartCard
        title="UMAP — 2D / 3D Toggle"
        desc="Click the 2D/3D button (top-right) to switch projection"
        height={420}
      >
        <ScatterChart
          data={scatter}
          z={zCoords}
          enable3D
          pointSize={4}
          opacity={0.82}
          autoFit
          legend
          toolbar
          toolbarPreset="standard"
          xLabel="UMAP 1"
          yLabel="UMAP 2"
        />
      </ChartCard>

      <div className="grid grid-cols-2 gap-5">
        <ChartCard
          title="3D Scatter View"
          desc="Dedicated 3D UMAP · drag to rotate"
          height={360}
        >
          <Scatter3DView data={scatter3d} pointSize={3} opacity={0.85} />
        </ChartCard>
        <ChartCard
          title="Volume Rendering"
          desc="32³ Gaussian blob · MIP / X-ray / ISO modes"
          height={360}
        >
          <VolumeView data={volume} />
        </ChartCard>
      </div>

      <ChartCard
        title="Mesh View"
        desc="UV sphere · drag to rotate · wireframe toggle"
        height={360}
      >
        <MeshView data={mesh} />
      </ChartCard>
    </div>
  );
}

function GenomicsSection() {
  const volcano = useMemo(() => makeVolcanoData(), []);
  const enrichment = useMemo(() => makeEnrichmentData(), []);
  const profile = useMemo(() => makeGenomicProfileData(), []);

  return (
    <div className="grid gap-5">
      <ChartCard
        title="Volcano Plot"
        desc="Differential expression · log₂FC vs −log₁₀(p-value)"
        height={420}
      >
        <VolcanoPlot data={volcano} toolbar />
      </ChartCard>

      <div className="grid grid-cols-2 gap-5">
        <ChartCard
          title="GSEA Enrichment Plot"
          desc="HALLMARK_T_CELL_ACTIVATION · NES 1.85 · FDR 0.021"
          height={340}
        >
          <EnrichmentPlot data={enrichment} />
        </ChartCard>
        <ChartCard
          title="Genomic Profile"
          desc="chr1:1Mb–2Mb · ATAC-seq signal · 5 kb bins"
          height={340}
        >
          <GenomicProfile data={profile} />
        </ChartCard>
      </div>
    </div>
  );
}

function AnalysisSection() {
  const gating = useMemo(() => makeGatingData(), []);
  const [selection, setSelection] = useState<ObsSetSelection | null>(null);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-5">
        <ChartCard
          title="FACS Gating Plot"
          desc="FSC-A vs SSC-A · draw gates · 3 populations"
          height={400}
        >
          <GatingPlot data={gating} toolbar toolbarPreset="full" />
        </ChartCard>

        <div className="flex flex-col gap-4">
          <ChartCard
            title="Obs Set Tree"
            desc="Hierarchical cell type annotation · click to select"
            height={240}
          >
            <div style={{ padding: '8px', height: '100%', overflowY: 'auto' }}>
              <ObsSetTree
                tree={obsSetTree as never}
                onSelectionChange={setSelection}
              />
            </div>
          </ChartCard>

          {/* Selection readout */}
          <div
            className="border border-border rounded-frame p-4 text-sm flex-1"
            style={{ background: 'hsl(var(--secondary))', borderRadius: 'var(--radius-frame)' }}
          >
            <p className="font-semibold text-foreground mb-2">Selected paths</p>
            {selection && selection.selectedPaths.length > 0 ? (
              <ul className="space-y-1">
                {selection.selectedPaths.map((path) => (
                  <li key={path.join('/')} className="text-xs text-muted-foreground font-mono">
                    {path.join(' › ')}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Click a node in the tree above</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SpatialSection() {
  const spatial = useMemo(() => makeSpatialData(), []);

  return (
    <div className="grid gap-5">
      <ChartCard
        title="Spatial Transcriptomics View"
        desc="600 cells · mock spatial positions · no image overlay (real use: OME-Zarr URL)"
        height={560}
      >
        <SpatialView data={spatial} />
      </ChartCard>
    </div>
  );
}

function BodyMapSection() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [clicked, setClicked] = useState<string | null>(null);

  const handleClick = (e: BodyMapEvent) => setClicked(e.organId);
  const handleHover = (e: BodyMapEvent) => setHovered(e.organId);
  const handleLeave = () => setHovered(null);

  const activeOrgan = clicked ?? hovered;
  const organInfo = activeOrgan ? bodyMapData[activeOrgan] : null;

  return (
    <div className="grid grid-cols-[1fr_280px] gap-5" style={{ height: 560 }}>
      <ChartCard title="Human Body Map" desc="Hover or click an organ to see dataset info">
        <HumanBodyMap
          data={bodyMapData}
          onOrganClick={handleClick}
          onOrganHover={handleHover}
          onOrganLeave={handleLeave}
          showLabels
        />
      </ChartCard>

      {/* Info panel */}
      <div
        className="border border-border p-5 flex flex-col gap-3"
        style={{
          borderRadius: 'var(--radius-frame)',
          background: 'hsl(var(--card))',
        }}
      >
        <p className="font-semibold text-sm text-foreground">Organ Info</p>

        {activeOrgan && organInfo ? (
          <>
            <p
              className="text-base font-bold capitalize"
              style={{ color: 'hsl(var(--primary))' }}
            >
              {activeOrgan.replace('-', ' ')}
            </p>
            <div className="flex flex-col gap-2 mt-1">
              {[
                { label: 'Datasets',  value: organInfo.datasetCount  },
                { label: 'Cells',     value: organInfo.cellCount?.toLocaleString()  },
                { label: 'Samples',   value: organInfo.sampleCount   },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">
            Hover over an organ on the map to see its metadata.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────

const SECTION_COMPONENTS: Record<Section, React.FC> = {
  bio:        BioSection,
  '3d':       ThreeDSection,
  genomics:   GenomicsSection,
  analysis:   AnalysisSection,
  spatial:    SpatialSection,
  bodymap:    BodyMapSection,
};

export default function App() {
  const [section, setSection] = useState<Section>('bio');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const SectionComponent = SECTION_COMPONENTS[section];

  return (
    <div className="flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      <Header section={section} onMenuClick={() => setSidebarCollapsed((v) => !v)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          section={section}
          onSelect={setSection}
        />

        <main className="flex-1 overflow-y-auto bg-background p-6">
          <SectionComponent />
        </main>
      </div>
    </div>
  );
}
