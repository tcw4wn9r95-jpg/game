// Fonts (bundled, so they work offline) and the gilded frame used by every panel.
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import './ui.css';

const dataUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`;

/** 48x48 nine-slice frame: dark rim, gold bevel, inner hairline and corner studs. */
const FRAME = `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6df98"/><stop offset=".45" stop-color="#c79639"/><stop offset="1" stop-color="#7d5519"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="46" height="46" fill="none" stroke="#120a03" stroke-width="2"/>
  <rect x="3" y="3" width="42" height="42" fill="none" stroke="url(#g)" stroke-width="2.4"/>
  <rect x="6.5" y="6.5" width="35" height="35" fill="none" stroke="#5c3f12" stroke-width="1"/>
  <g fill="url(#g)" stroke="#120a03" stroke-width=".8">
    <path d="M4 0.5L7.5 4 4 7.5 0.5 4z"/><path d="M44 0.5L47.5 4 44 7.5 40.5 4z"/>
    <path d="M4 40.5L7.5 44 4 47.5 0.5 44z"/><path d="M44 40.5L47.5 44 44 47.5 40.5 44z"/>
  </g>
</svg>`;

/** Lighter frame for buttons and cards. */
const FRAME_THIN = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6df98"/><stop offset=".5" stop-color="#b8862f"/><stop offset="1" stop-color="#6e4a14"/>
    </linearGradient>
  </defs>
  <rect x=".75" y=".75" width="22.5" height="22.5" rx="3" fill="none" stroke="#120a03" stroke-width="1.5"/>
  <rect x="2.25" y="2.25" width="19.5" height="19.5" rx="2" fill="none" stroke="url(#g)" stroke-width="1.6"/>
</svg>`;

export function installTheme(): void {
  const root = document.documentElement.style;
  root.setProperty('--frame', dataUrl(FRAME));
  root.setProperty('--frame-thin', dataUrl(FRAME_THIN));
}
