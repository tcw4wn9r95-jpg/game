// Hand-drawn inline SVG icons (original art).
const svg = (body: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

const INK = '#2a1606';

export const ICONS = {
  food: svg(`
    <line x1="11.5" y1="12.5" x2="5" y2="19" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/>
    <circle cx="4.1" cy="17.6" r="2.4" fill="${INK}"/><circle cx="6.4" cy="19.9" r="2.4" fill="${INK}"/>
    <line x1="11.5" y1="12.5" x2="5" y2="19" stroke="#f3e7c9" stroke-width="2.8" stroke-linecap="round"/>
    <circle cx="4.1" cy="17.6" r="1.6" fill="#f3e7c9"/><circle cx="6.4" cy="19.9" r="1.6" fill="#f3e7c9"/>
    <ellipse cx="14.8" cy="9.2" rx="7" ry="5.6" transform="rotate(-45 14.8 9.2)" fill="#c4572f" stroke="${INK}" stroke-width="1.2"/>
    <path d="M12.2 6.6c1.7-1.6 4.2-1.6 5.6-.1" stroke="#f2a476" stroke-width="1.5" fill="none" stroke-linecap="round"/>`),
  wood: svg(`
    <rect x="2" y="13.5" width="17" height="6" rx="3" fill="#8a5a2b" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="19" cy="16.5" rx="2.6" ry="3" fill="#e2bb84" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="19" cy="16.5" rx="1" ry="1.2" fill="none" stroke="#a5713a" stroke-width=".8"/>
    <rect x="3.5" y="6.5" width="16" height="6" rx="3" fill="#9b6733" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="19.5" cy="9.5" rx="2.6" ry="3" fill="#e2bb84" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="19.5" cy="9.5" rx="1" ry="1.2" fill="none" stroke="#a5713a" stroke-width=".8"/>
    <path d="M5.5 9h8M4.5 16.5h9" stroke="#6b421c" stroke-width="1" stroke-linecap="round"/>`),
  gold: svg(`
    <ellipse cx="10" cy="18" rx="7.5" ry="2.8" fill="#c8961c" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="10" cy="15" rx="7.5" ry="2.8" fill="#e0ad2a" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="10" cy="12" rx="7.5" ry="2.8" fill="#f5c842" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="10" cy="12" rx="4" ry="1.2" fill="none" stroke="#fff0a8" stroke-width="1"/>
    <circle cx="18" cy="8" r="4.6" fill="#f5c842" stroke="${INK}" stroke-width="1.2"/>
    <circle cx="18" cy="8" r="2.6" fill="none" stroke="#b9871a" stroke-width="1"/>
    <path d="M16.4 6.2l.9-.6" stroke="#fff6c2" stroke-width="1.2" stroke-linecap="round"/>`),
  stone: svg(`
    <path d="M3 19l2-7 6-2 3 3-1 6z" fill="#8f8f8b" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M11 19l1-6 5-3 4 3-1 6z" fill="#a9a9a4" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M7 10l2-5 6-1 2 5-6 2z" fill="#c4c4bf" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M9.5 6.5l4-.6M6 13l3-1M13.5 13l3-1.6" stroke="#ecece6" stroke-width="1" stroke-linecap="round"/>`),
  pop: svg(`
    <circle cx="12" cy="7.5" r="3.8" fill="#ecdcb6" stroke="${INK}" stroke-width="1.2"/>
    <path d="M4.5 20.5c.6-4.6 3.6-7.2 7.5-7.2s6.9 2.6 7.5 7.2z" fill="#3f6fb0" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M9 15.5l3 2.5 3-2.5" stroke="#f1d48a" stroke-width="1.2" fill="none"/>`),
  clock: svg(`
    <path d="M6 3h12M6 21h12" stroke="#c99a3c" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M7.5 3.5c0 5 4.5 6 4.5 8.5S7.5 15.5 7.5 20.5h9c0-5-4.5-6-4.5-8.5s4.5-3.5 4.5-8.5z" fill="#f4ead2" fill-opacity=".25" stroke="#e8d7ae" stroke-width="1.3"/>
    <path d="M9.5 19.5c.5-2 2.5-3 2.5-3s2 1 2.5 3z M10 7.5h4c-.5 1.5-2 2.4-2 2.4s-1.5-.9-2-2.4z" fill="#e2bb5c"/>`),
  crown: svg(`
    <path d="M3 18l-1-11 5.5 4.5L12 4l4.5 7.5L22 7l-1 11z" fill="#f2c94c" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
    <rect x="3" y="18" width="18" height="3" rx="1" fill="#c8962a" stroke="${INK}" stroke-width="1.2"/>
    <circle cx="12" cy="14.5" r="1.8" fill="#c0283c" stroke="${INK}" stroke-width=".8"/>
    <circle cx="2" cy="7" r="1.4" fill="#f2c94c" stroke="${INK}" stroke-width=".8"/>
    <circle cx="12" cy="4" r="1.4" fill="#f2c94c" stroke="${INK}" stroke-width=".8"/>
    <circle cx="22" cy="7" r="1.4" fill="#f2c94c" stroke="${INK}" stroke-width=".8"/>`),
  menu: svg(`
    <path d="M5 7h14M5 12h14M5 17h14" stroke="#2a1606" stroke-width="4" stroke-linecap="round"/>
    <path d="M5 7h14M5 12h14M5 17h14" stroke="#f1d48a" stroke-width="2.2" stroke-linecap="round"/>`),
  villager: svg(`
    <circle cx="12" cy="6.5" r="3.4" fill="#e0b48c" stroke="${INK}" stroke-width="1.1"/>
    <path d="M8.6 6c0-2.6 1.6-4 3.4-4s3.4 1.4 3.4 4z" fill="#7a5a36"/>
    <path d="M6 21l1.6-8.5c.4-2 2.2-3 4.4-3s4 1 4.4 3L18 21z" fill="#3f6fb0" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M7.5 15.5h9" stroke="#5a3a1c" stroke-width="1.4"/>
    <path d="M17 9l4-4" stroke="#6b4a2a" stroke-width="1.6" stroke-linecap="round"/><path d="M19.5 3.5l2.5 1-1 2.5z" fill="#a8b0b6" stroke="${INK}" stroke-width=".6"/>`),
  scout: svg(`
    <path d="M3 17c0-3 2-5 6-5h6l3-4 3 1-2 5v4" fill="#8a5a30" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M5 17v4M9 17v4M15 17v4M18 17v4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M10 12l1-6h3l1 6z" fill="#3f6fb0" stroke="${INK}" stroke-width="1"/>
    <circle cx="12.5" cy="4.2" r="2" fill="#e0b48c" stroke="${INK}" stroke-width=".9"/>`),
  town_center: svg(`
    <path d="M2 21V12h20v9z" fill="#d8c8a0" stroke="${INK}" stroke-width="1.1"/>
    <path d="M1 12.5L5 7h14l4 5.5z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M9 12V6h6v6z" fill="#d8c8a0" stroke="${INK}" stroke-width="1"/><path d="M8 6.5l4-4 4 4z" fill="#d1ae5c" stroke="${INK}" stroke-width="1"/>
    <path d="M10.5 21v-4a1.5 1.5 0 013 0v4z" fill="#3a2412"/><path d="M12 2.5V0" stroke="${INK}"/><path d="M12 .2l3 .9-3 .9z" fill="#3f6fb0"/>`),
  house: svg(`
    <path d="M4 21v-8h16v8z" fill="#d8c8a0" stroke="${INK}" stroke-width="1.1"/>
    <path d="M2 13.5L7 6h10l5 7.5z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M7 21v-4.5a1.5 1.5 0 013 0V21z" fill="#3a2412"/><rect x="14" y="15" width="3" height="3" fill="#3a2412"/>`),
  lumber_camp: svg(`
    <path d="M2 11L6 5h11l3 6z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M4 11v9M18 11v9" stroke="#5a3d22" stroke-width="1.6"/><rect x="4" y="11" width="14" height="6" fill="#2b1d10"/>
    <g fill="#d6b07a" stroke="${INK}" stroke-width=".8"><circle cx="9" cy="20" r="2"/><circle cx="13" cy="20" r="2"/><circle cx="11" cy="17" r="2"/></g>`),
  mining_camp: svg(`
    <path d="M2 11L6 5h11l3 6z" fill="#d1ae5c" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M4 11v9M18 11v9" stroke="#5a3d22" stroke-width="1.6"/><rect x="4" y="11" width="14" height="6" fill="#2b1d10"/>
    <rect x="7" y="15" width="9" height="4.5" fill="#5a4a3a" stroke="${INK}" stroke-width=".9"/>
    <circle cx="9" cy="20.5" r="1.4" fill="${INK}"/><circle cx="14" cy="20.5" r="1.4" fill="${INK}"/>
    <circle cx="10" cy="14.5" r="1.6" fill="#f2c230" stroke="${INK}" stroke-width=".6"/><circle cx="13" cy="14.8" r="1.5" fill="#b4b4ae" stroke="${INK}" stroke-width=".6"/>`),
  mill: svg(`
    <path d="M6 21v-8h12v8z" fill="#d8c8a0" stroke="${INK}" stroke-width="1.1"/>
    <path d="M4.5 13.5L8 9h8l3.5 4.5z" fill="#d1ae5c" stroke="${INK}" stroke-width="1"/>
    <g stroke="#5a3d22" stroke-width="1.4"><path d="M12 9L5 2M12 9l7-7M12 9L4 15M12 9l8 6"/></g>
    <g fill="#f0e6cc" stroke="${INK}" stroke-width=".5"><path d="M6 2.5l2.6 1-2.2 2.2-1.4-2.4z"/><path d="M18 2.5l-2.6 1 2.2 2.2 1.4-2.4z"/></g>
    <circle cx="12" cy="9" r="1.5" fill="${INK}"/>`),
  hammer: svg(`
    <path d="M13 9l8 8-2.5 2.5-8-8" fill="#8a5a30" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M3 9.5L9.5 3l5 5-6.5 6.5z" fill="#a8b0b6" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M5.5 9.3l4-4" stroke="#e6ecef" stroke-width="1.2" stroke-linecap="round"/>`),
  stop: svg(`
    <path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" fill="#b8352b" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <rect x="7" y="10.5" width="10" height="3" rx="1" fill="#f6ead0"/>`),
  close: svg(`<path d="M6 6l12 12M18 6L6 18" stroke="${INK}" stroke-width="4.2" stroke-linecap="round"/><path d="M6 6l12 12M18 6L6 18" stroke="#f1d48a" stroke-width="2.2" stroke-linecap="round"/>`),
  check: svg(`<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="${INK}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#9cf59a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  sheep: svg(`<ellipse cx="11" cy="13" rx="7" ry="5" fill="#f3f2ea" stroke="${INK}" stroke-width="1.1"/><ellipse cx="18.5" cy="11" rx="2.6" ry="2" fill="#3a3a3a"/><path d="M7 17.5v3M14 17.5v3" stroke="${INK}" stroke-width="1.6"/>`),
  deer: svg(`<ellipse cx="11" cy="13" rx="7" ry="3.6" fill="#9b6a3c" stroke="${INK}" stroke-width="1.1"/><path d="M16 11l3-6 2 1-2 6" fill="#9b6a3c" stroke="${INK}" stroke-width="1"/><path d="M19 5l-1-3M20 5l2-2" stroke="#d8c6a4" stroke-width="1.1"/><path d="M6 16v5M9 16v5M14 16v5M16 16v5" stroke="${INK}" stroke-width="1.4"/>`),
  fish: svg(`<path d="M3 12c4-5 10-5 14 0-4 5-10 5-14 0z" fill="#6aa7c9" stroke="${INK}" stroke-width="1.1"/><path d="M17 12l4-4v8z" fill="#6aa7c9" stroke="${INK}" stroke-width="1.1"/><circle cx="7" cy="11" r="1" fill="${INK}"/>`),
  dice: svg(`
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="#f4ead2" stroke="${INK}" stroke-width="1.4"/>
    <circle cx="8" cy="8" r="1.6" fill="${INK}"/><circle cx="16" cy="8" r="1.6" fill="${INK}"/>
    <circle cx="12" cy="12" r="1.6" fill="${INK}"/>
    <circle cx="8" cy="16" r="1.6" fill="${INK}"/><circle cx="16" cy="16" r="1.6" fill="${INK}"/>`),
};

/** Small landscape vignettes for the map-type cards (64x40). */
export const MAP_ICONS = {
  heartland: svg(
    `<rect width="64" height="40" fill="#5b9a3f"/>
     <path d="M0 26C14 24 18 12 32 14s20 14 32 8" stroke="#2b6aa3" stroke-width="6" fill="none"/>
     <path d="M30 10l4 10" stroke="#9fd6dc" stroke-width="4"/>
     <circle cx="12" cy="10" r="4" fill="#2e6a29"/><circle cx="17" cy="8" r="3.4" fill="#36762f"/>
     <circle cx="50" cy="32" r="4" fill="#2e6a29"/><circle cx="55" cy="34" r="3" fill="#36762f"/>`,
    '0 0 64 40',
  ),
  coastal: svg(
    `<rect width="64" height="40" fill="#28689f"/>
     <path d="M0 0h40c-4 8 4 14-2 22s4 12 2 18H0z" fill="#e6d391"/>
     <path d="M0 0h36c-4 8 4 14-2 22s4 12 2 18H0z" fill="#7a9e48"/>
     <path d="M48 12c3-1.5 5 1.5 8 0M46 28c3-1.5 5 1.5 8 0" stroke="#7fb3dc" stroke-width="1.6" fill="none"/>
     <path d="M12 6l4 9h-8z M22 18l4 9h-8z" fill="#245a2e"/>`,
    '0 0 64 40',
  ),
  lakes: svg(
    `<rect width="64" height="40" fill="#4a874b"/>
     <ellipse cx="32" cy="20" rx="17" ry="11" fill="#cfc08a"/>
     <ellipse cx="32" cy="20" rx="15" ry="9.2" fill="#24618f"/>
     <path d="M26 18c3-1.5 5 1.5 8 0" stroke="#6ab4c4" stroke-width="1.5" fill="none"/>
     <path d="M7 6l4 9H3z M57 24l4 9h-8z M52 4l3.5 8h-7z" fill="#1f5a2e"/>`,
    '0 0 64 40',
  ),
  islands: svg(
    `<rect width="64" height="40" fill="#1f74a8"/>
     <ellipse cx="14" cy="12" rx="10" ry="7" fill="#ecdca0"/><ellipse cx="14" cy="12" rx="8" ry="5.4" fill="#62a845"/>
     <ellipse cx="50" cy="28" rx="10" ry="7" fill="#ecdca0"/><ellipse cx="50" cy="28" rx="8" ry="5.4" fill="#62a845"/>
     <ellipse cx="33" cy="21" rx="5" ry="3.6" fill="#ecdca0"/><ellipse cx="33" cy="21" rx="3.6" ry="2.4" fill="#62a845"/>
     <path d="M40 9c3-1.5 5 1.5 8 0M10 31c3-1.5 5 1.5 8 0" stroke="#7fc3e0" stroke-width="1.5" fill="none"/>`,
    '0 0 64 40',
  ),
};
