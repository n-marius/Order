def svg(top, bottom, deep, glyph, mask='', sc=0.9, cy=512):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/>
    </linearGradient>
    <radialGradient id="light" cx="0.5" cy="0.0" r="0.9">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="plate" gradientUnits="userSpaceOnUse" x1="0" y1="180" x2="0" y2="844">
      <stop offset="0" stop-color="#fff" stop-opacity="0.30"/><stop offset="1" stop-color="#fff" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="plateEdge" gradientUnits="userSpaceOnUse" x1="0" y1="180" x2="0" y2="844">
      <stop offset="0" stop-color="#fff" stop-opacity="0.75"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#fff" stop-opacity="0.35"/>
    </linearGradient>
    <linearGradient id="glyph" gradientUnits="userSpaceOnUse" x1="0" y1="260" x2="0" y2="760">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1F4FA"/>
    </linearGradient>
    <filter id="drop" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="{deep}" flood-opacity="0.38"/>
    </filter>
    {mask}
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#light)"/>
  <circle cx="512" cy="512" r="332" fill="url(#plate)"/>
  <circle cx="512" cy="512" r="331" fill="none" stroke="url(#plateEdge)" stroke-width="3"/>
  <circle cx="512" cy="512" r="258" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="6"/>
  <g filter="url(#drop)" fill="url(#glyph)" transform="translate(512 {cy}) scale({sc}) translate(-512 -512)">
{glyph}
  </g>
</svg>'''

# Gabel und Messer (Bestellen)
fork_knife_mask = '''<mask id="tines" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#fff"/>
      <rect x="383" y="250" width="16" height="132" rx="8" fill="#000"/>
      <rect x="441" y="250" width="16" height="132" rx="8" fill="#000"/>
    </mask>'''
fork_knife = '''    <g mask="url(#tines)">
      <path d="M346 284 Q346 262 368 262 L472 262 Q494 262 494 284 L494 400 Q494 452 444 468 L444 742 Q444 774 420 774 Q396 774 396 742 L396 468 Q346 452 346 400 Z"/>
    </g>
    <path d="M598 262 C668 280 690 380 688 476 Q688 500 664 504 L646 506 L646 742 Q646 774 622 774 Q598 774 598 742 Z"/>'''

# Kochmütze (Küche)
toque_mask = '''<mask id="pleats" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#fff"/>
      <rect x="463" y="520" width="16" height="84" rx="8" fill="#000"/>
      <rect x="545" y="520" width="16" height="84" rx="8" fill="#000"/>
    </mask>'''
toque = '''    <g mask="url(#pleats)">
      <circle cx="404" cy="434" r="112"/>
      <circle cx="512" cy="372" r="134"/>
      <circle cx="620" cy="434" r="112"/>
      <path d="M392 440 H632 L620 632 H404 Z"/>
    </g>
    <rect x="398" y="652" width="228" height="74" rx="22"/>'''

open('logo-bestellen.svg','w').write(svg('#4AA3FF', '#0B5FE0', '#062F8A', fork_knife, fork_knife_mask, 0.88, 512))
open('logo-kueche.svg','w').write(svg('#FFB340', '#FF7A00', '#8A3A00', toque, toque_mask, 0.86, 530))
