// Symbole im Stil der SF Symbols (24er Raster, Linienstärke über CSS --icon-stroke).
// Verwendung: icon('basket') → SVG-String, iconEl('basket') → Element.

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  xmark: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevronRight: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  chevronLeft: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  chevronDown: '<path d="M5.5 9.5L12 16l6.5-6.5"/>',
  basket: '<path d="M3.5 9.5h17l-1.6 8.6a2 2 0 0 1-2 1.6H7.1a2 2 0 0 1-2-1.6z"/><path d="M8 9.5l3-5M16 9.5l-3-5M9.5 13v3.5M14.5 13v3.5"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/><circle cx="12" cy="12" r="6.6"/>',
  sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M9.5 4.5v15M5.5 8.5h1.8M5.5 11.5h1.8"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  wifiSlash: '<path d="M2.5 9a14 14 0 0 1 6-3.2M21.5 9a14 14 0 0 0-8.3-3.4M5.5 12.3a9.5 9.5 0 0 1 3.4-2M18.5 12.3a9.5 9.5 0 0 0-3-1.9M8.7 15.5a5 5 0 0 1 6.6 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/><path d="M4 3.5l16 17"/>',
  warning: '<path d="M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17.2" r=".9" fill="currentColor"/>',
  question: '<path d="M20.5 11.5c0 4.4-3.8 8-8.5 8-1.2 0-2.4-.2-3.4-.7L4 20l1.3-3.7A7.6 7.6 0 0 1 3.5 11.5c0-4.4 3.8-8 8.5-8s8.5 3.6 8.5 8z"/><path d="M9.8 9.4a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 1.9-2.2 3.4"/><circle cx="12" cy="16.3" r=".9" fill="currentColor"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7M6.5 6.5l.8 12.3a2 2 0 0 0 2 1.7h5.4a2 2 0 0 0 2-1.7l.8-12.3M10 10.5v6M14 10.5v6"/>',
  pencil: '<path d="M15.5 4.5l4 4L8.5 19.5 4 20l.5-4.5z"/><path d="M13.5 6.5l4 4"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10" r="1.8"/><path d="M21 15.5l-4.8-4.8L6 19"/>',
  camera: '<path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5L16 6.5h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.8" cy="7" r="1" fill="currentColor"/><circle cx="4.8" cy="12" r="1" fill="currentColor"/><circle cx="4.8" cy="17" r="1" fill="currentColor"/>',
  forkKnife: '<path d="M7 3.5v6.5M4.5 3.5v4.5a2.5 2.5 0 0 0 5 0V3.5M7 10v10.5"/><path d="M17 20.5V3.5c-2 1-3.5 3.5-3.5 7.5h3.5"/>',
  wineglass: '<path d="M7.5 3.5h9c.4 4-.6 8-4.5 8s-4.9-4-4.5-8zM12 11.5v8.5M8.5 20.5h7"/><path d="M7.7 7.5h8.6"/>',
  cup: '<path d="M5.5 8.5h11l-1.3 10.3a2 2 0 0 1-2 1.7H8.8a2 2 0 0 1-2-1.7z"/><path d="M11.5 8.5l1.5-5h3"/><path d="M6 12.5h10"/>',
  cake: '<path d="M4 20.5h16M5 20.5v-6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6.5"/><path d="M5 15.5c1.2 1 2.3 1 3.5 0s2.3-1 3.5 0 2.3 1 3.5 0 2.3-1 3.5 0M12 12V9"/><path d="M12 4.5c.9.9 1.2 1.7.8 2.5-.4.7-1.2.7-1.6 0-.4-.8-.1-1.6.8-2.5z"/>',
  leaf: '<path d="M5 19c0-8 4.5-13.5 15-14.5-.5 10.5-6 15-14 15"/><path d="M5 19c3-4 6-6.5 10-8.5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  note: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>',
  compose: '<path d="M12.5 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6"/><path d="M17.5 3.5l3 3-8 8-3.5.5.5-3.5z"/>',
  undo: '<path d="M9 14.5L4.5 10 9 5.5"/><path d="M4.5 10h10a5 5 0 0 1 0 10H11"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.9" r=".9" fill="currentColor"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  ellipsis: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
  house: '<path d="M4 11l8-6.5 8 6.5M6 9.5v10h12v-10"/><path d="M10 19.5v-5h4v5"/>',
  flame: '<path d="M12 20.5c-3.6 0-6-2.4-6-5.8 0-3.6 2.8-5.4 3.8-9.2 2.6 1.7 3.4 4 3.2 6 .9-.4 1.6-1.4 1.8-2.5 1.9 1.6 3.2 3.4 3.2 5.7 0 3.4-2.4 5.8-6 5.8z"/>',
  snowflake: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 6.5l2.5-2M9.5 19.5L12 17.5l2.5 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  arrowClockwise: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8L16.2 9.5"/>',
  xCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
  bag: '<path d="M5.5 8h13l-.9 11a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  tray: '<path d="M3.5 13.5l2.5-8h12l2.5 8v5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18.5z"/><path d="M3.5 13.5h5l1 2h5l1-2h5"/>',
  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  carrot: '<path d="M14 10l-9.5 9.5c-.4.4.1 1 .6.6L14.5 11"/><path d="M15.5 8.5c-2-2-4.5-1-6 1.5l4.5 4.5c2.5-1.5 3.5-4 1.5-6z"/><path d="M15.5 8.5l3.5-3.5M17 4l-1.5 4.5M20 7l-4.5 1.5"/>',
  hand: '<path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V10M14 10V5.5a1.5 1.5 0 0 1 3 0V13c0 4.5-2.5 7.5-6 7.5-2.6 0-4.2-1.3-5.4-3.4L3.8 14a1.5 1.5 0 0 1 2.5-1.6L8 14"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export function iconEl(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = icon(name, cls);
  return t.content.firstChild;
}

export const ICON_NAMES = Object.keys(P);
