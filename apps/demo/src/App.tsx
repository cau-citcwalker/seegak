import { useMemo, useState } from 'react';
import {
  ScatterChart,
  BarChart,
  PieChart,
  type BarChartData,
  type PieChartData,
} from '@seegak/react';

// ─── Mock data helpers ───────────────────────────────────────

function makeUmapData() {
  const N = 800;
  const clusters = [
    { label: 'T Cell',       color: '#4e8ef7', cx: -3,  cy:  2  },
    { label: 'B Cell',       color: '#f97316', cx:  3,  cy:  2  },
    { label: 'NK Cell',      color: '#22c55e', cx:  0,  cy: -3  },
    { label: 'Monocyte',     color: '#a855f7', cx: -2,  cy: -1  },
    { label: 'Dendritic',    color: '#ec4899', cx:  2,  cy: -1  },
  ];

  const x: number[] = [];
  const y: number[] = [];
  const colors: string[] = [];
  const labels: string[] = [];

  for (let i = 0; i < N; i++) {
    const c = clusters[i % clusters.length];
    x.push(c.cx + (Math.random() - 0.5) * 2.5);
    y.push(c.cy + (Math.random() - 0.5) * 2.5);
    colors.push(c.color);
    labels.push(c.label);
  }

  return {
    x: new Float32Array(x),
    y: new Float32Array(y),
    colors,
    labels,
  };
}

const barData: BarChartData = {
  groups: [
    { label: 'T Cell',    values: [320], color: '#4e8ef7' },
    { label: 'B Cell',    values: [180], color: '#f97316' },
    { label: 'NK Cell',   values: [220], color: '#22c55e' },
    { label: 'Monocyte',  values: [140], color: '#a855f7' },
    { label: 'Dendritic', values: [ 80], color: '#ec4899' },
  ],
  valueLabels: ['Count'],
};

const pieData: PieChartData = {
  slices: [
    { label: 'T Cell',    value: 320, color: '#4e8ef7' },
    { label: 'B Cell',    value: 180, color: '#f97316' },
    { label: 'NK Cell',   value: 220, color: '#22c55e' },
    { label: 'Monocyte',  value: 140, color: '#a855f7' },
    { label: 'Dendritic', value:  80, color: '#ec4899' },
  ],
};

// ─── Sub-components ──────────────────────────────────────────

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header
      className="flex items-center gap-4 px-6 border-b border-border bg-card"
      style={{ height: 'var(--header-height)', flexShrink: 0 }}
    >
      <button
        onClick={onMenuClick}
        className="flex flex-col gap-1 p-1 rounded hover:bg-secondary transition-colors"
        title="Toggle sidebar"
      >
        <span className="block w-4 h-0.5 bg-foreground/60 rounded" />
        <span className="block w-4 h-0.5 bg-foreground/60 rounded" />
        <span className="block w-4 h-0.5 bg-foreground/60 rounded" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2">
        <span
          className="font-bold text-lg tracking-tight"
          style={{ color: 'hsl(var(--primary))' }}
        >
          K-MAP
        </span>
        <span className="text-sm text-muted-foreground font-medium">
          × seegak demo
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground font-medium">
          kmap-style branch
        </span>
      </div>
    </header>
  );
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  const navItems = [
    { icon: '⬡', label: 'Overview' },
    { icon: '◎', label: 'UMAP / Scatter',  active: true },
    { icon: '▦', label: 'Cell Composition' },
    { icon: '⬙', label: 'Gene Expression' },
    { icon: '⬡', label: 'Spatial' },
    { icon: '⬡', label: 'Genomics' },
  ];

  return (
    <aside
      className="flex flex-col border-r border-sidebar-border bg-sidebar overflow-hidden transition-all duration-200"
      style={{ width: collapsed ? 0 : 'var(--sidebar-width)', flexShrink: 0 }}
    >
      <div style={{ width: 'var(--sidebar-width)' }}>
        <nav className="p-2 pt-4 flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={[
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left w-full',
                item.active
                  ? 'font-semibold'
                  : 'text-sidebar-foreground hover:bg-white/60',
              ].join(' ')}
              style={
                item.active
                  ? {
                      background: 'white',
                      color: 'hsl(var(--sidebar-primary))',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }
                  : undefined
              }
            >
              <span className="text-base w-5 text-center opacity-60">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mx-4 mt-4 mb-2 h-px bg-sidebar-border" />

        <div className="px-4 py-2">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
            Dataset
          </p>
          <p className="text-xs text-muted-foreground">PBMC 3k (10x Genomics)</p>
          <p className="text-xs text-muted-foreground">940 cells · 5 clusters</p>
        </div>
      </div>
    </aside>
  );
}

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  height?: number;
}

function ChartCard({ title, description, children, height = 360 }: ChartCardProps) {
  return (
    <div
      className="bg-card border border-border flex flex-col overflow-hidden"
      style={{ borderRadius: 'var(--radius-frame)' }}
    >
      <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div style={{ height, position: 'relative' }}>{children}</div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const scatterData = useMemo(() => makeUmapData(), []);

  return (
    <div className="flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      <Header onMenuClick={() => setSidebarCollapsed((v) => !v)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6 bg-background">
          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-xl font-bold text-foreground">UMAP Visualization</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Single-cell RNA-seq · PBMC 3k · KMAP 디자인 시스템 적용 예시
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Total Cells', value: '940' },
              { label: 'Clusters',    value: '5' },
              { label: 'Genes',       value: '32,738' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-card border border-border rounded-lg px-5 py-4"
              >
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Charts grid */}
          <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {/* UMAP scatter — full width */}
            <div style={{ gridColumn: '1 / -1' }}>
              <ChartCard
                title="UMAP Embedding"
                description="2D projection of single-cell transcriptomics data — pan & lasso select to explore clusters"
                height={440}
              >
                <ScatterChart
                  data={scatterData}
                  pointSize={4}
                  opacity={0.8}
                  autoFit
                  toolbar={{ preset: 'standard' }}
                  legend
                  xLabel="UMAP 1"
                  yLabel="UMAP 2"
                />
              </ChartCard>
            </div>

            {/* Cell composition bar chart */}
            <ChartCard
              title="Cell Type Composition"
              description="Number of cells per cluster"
              height={300}
            >
              <BarChart data={barData} barWidth={0.6} />
            </ChartCard>

            {/* Pie chart */}
            <ChartCard
              title="Cluster Distribution"
              description="Proportional breakdown of cell types"
              height={300}
            >
              <PieChart data={pieData} showLabels showPercentage />
            </ChartCard>
          </div>

          {/* Integration note */}
          <div
            className="mt-6 p-4 rounded-lg border text-sm text-muted-foreground"
            style={{
              background: 'hsl(var(--secondary))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            <span
              className="font-semibold mr-1"
              style={{ color: 'hsl(var(--primary))' }}
            >
              Note:
            </span>
            이 데모는 seegak의 <code className="font-mono text-xs bg-white px-1 py-0.5 rounded border border-border">kmap-style</code> 브랜치에서
            실행됩니다. Toolbar · Tooltip · Legend · Download Modal 의 inline CSS가
            KMAP 디자인 토큰(Pretendard 폰트, #EA2264 primary, 라이트 테마)으로
            교체되었습니다.
          </div>
        </main>
      </div>
    </div>
  );
}
