/**
 * Download modal — shows a dropdown of export options when the download
 * button is clicked in the toolbar.
 */

export interface DownloadOption {
  id: string;
  label: string;
  description?: string;
}

const DEFAULT_OPTIONS: DownloadOption[] = [
  { id: 'png', label: 'PNG Image', description: 'High-resolution raster image (2x)' },
  { id: 'svg', label: 'SVG Image', description: 'Vector graphics' },
];

export class DownloadModal {
  private el: HTMLElement;
  private visible = false;
  private onSelect: (id: string) => void;
  private options: DownloadOption[];

  constructor(
    container: HTMLElement,
    onSelect: (id: string) => void,
    options?: DownloadOption[],
  ) {
    this.onSelect = onSelect;
    this.options = options ?? DEFAULT_OPTIONS;

    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'display:none',
      'z-index:100',
      'background:rgba(15,20,30,0.95)',
      'border:1px solid rgba(255,255,255,0.12)',
      'border-radius:8px',
      'padding:6px 0',
      'min-width:180px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.5)',
      'backdrop-filter:blur(8px)',
    ].join(';');

    // Title
    const title = document.createElement('div');
    title.textContent = 'Download';
    title.style.cssText = [
      'padding:6px 14px 8px',
      'font-size:11px',
      'font-weight:600',
      'color:rgba(255,255,255,0.4)',
      'text-transform:uppercase',
      'letter-spacing:0.06em',
      'border-bottom:1px solid rgba(255,255,255,0.08)',
    ].join(';');
    this.el.appendChild(title);

    // Option rows
    for (const opt of this.options) {
      const row = document.createElement('div');
      row.style.cssText = [
        'padding:8px 14px',
        'cursor:pointer',
        'transition:background 0.1s',
        'display:flex',
        'flex-direction:column',
        'gap:2px',
      ].join(';');

      const label = document.createElement('div');
      label.textContent = opt.label;
      label.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.85);font-weight:500;';
      row.appendChild(label);

      if (opt.description) {
        const desc = document.createElement('div');
        desc.textContent = opt.description;
        desc.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.35);';
        row.appendChild(desc);
      }

      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.08)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
        this.onSelect(opt.id);
      });

      this.el.appendChild(row);
    }

    container.appendChild(this.el);

    // Close on outside click
    this.onDocClick = this.onDocClick.bind(this);
  }

  show(anchorX: number, anchorY: number): void {
    this.el.style.display = 'block';
    this.el.style.left = `${anchorX}px`;
    this.el.style.top = `${anchorY}px`;
    this.visible = true;
    setTimeout(() => document.addEventListener('click', this.onDocClick), 0);
  }

  hide(): void {
    this.el.style.display = 'none';
    this.visible = false;
    document.removeEventListener('click', this.onDocClick);
  }

  toggle(anchorX: number, anchorY: number): void {
    if (this.visible) this.hide();
    else this.show(anchorX, anchorY);
  }

  setOptions(options: DownloadOption[]): void {
    this.options = options;
    // Rebuild — simplest approach
    const parent = this.el.parentElement;
    if (parent) {
      const onSelect = this.onSelect;
      this.destroy();
      const modal = new DownloadModal(parent, onSelect, options);
      // Copy reference
      Object.assign(this, modal);
    }
  }

  private onDocClick(): void {
    this.hide();
  }

  destroy(): void {
    document.removeEventListener('click', this.onDocClick);
    this.el.remove();
  }
}
