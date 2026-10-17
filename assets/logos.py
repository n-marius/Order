import sys
def cloche(lift=False):
    dome = '''
    <g %s>
      <path d="M222 700 C222 512 352 388 512 388 C672 388 802 512 802 700 A290 34 0 0 1 222 700 Z" fill="url(#chrome)"/>
      <path d="M222 700 C222 512 352 388 512 388 C672 388 802 512 802 700 A290 34 0 0 1 222 700 Z" fill="url(#shadeV)"/>
      <path d="M222 700 C222 512 352 388 512 388 C672 388 802 512 802 700 A290 34 0 0 1 222 700 Z" fill="url(#tint)" opacity="0.35" style="mix-blend-mode:multiply"/>
      <path d="M226 700 A290 34 0 0 0 798 700" fill="none" stroke="url(#rim)" stroke-width="16" stroke-linecap="round"/>
      <path d="M300 610 C300 520 370 450 452 428" fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round" opacity="0.9" filter="url(#soft)"/>
      <path d="M318 640 C312 625 310 612 310 600" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity="0.6" filter="url(#soft)"/>
      <rect x="499" y="364" width="26" height="30" rx="6" fill="url(#chromeS)"/>
      <ellipse cx="512" cy="352" rx="40" ry="30" fill="url(#knob)"/>
      <ellipse cx="500" cy="342" rx="16" ry="8" fill="#fff" opacity="0.85" filter="url(#soft)"/>
    </g>''' % ('transform="translate(-4 -14) rotate(21 802 700)"' if lift else '')
    return dome

def svg(bg0, bg1, accent, glow, lift):
    plate = '''
    <ellipse cx="512" cy="748" rx="300" ry="44" fill="#000" opacity="0.5" filter="url(#blur18)"/>
    <ellipse cx="512" cy="712" rx="336" ry="64" fill="url(#plateEdge)"/>
    <ellipse cx="512" cy="704" rx="300" ry="50" fill="url(#plateTop)"/>
    <ellipse cx="512" cy="706" rx="210" ry="30" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="3"/>'''
    glowel = ''
    steam = ''
    if glow:
        glowel = '''
    <ellipse cx="512" cy="660" rx="300" ry="170" fill="url(#warm)" filter="url(#blur40)"/>
    <ellipse cx="512" cy="690" rx="190" ry="40" fill="#FFE6A8" opacity="0.9" filter="url(#blur18)"/>
    '''
        steam = '''
    <g fill="none" stroke="#FFF3D6" stroke-linecap="round" filter="url(#soft)" opacity="0.7">
      <path d="M300 664 C276 628 322 604 298 566" stroke-width="15"/>
      <path d="M356 660 C330 620 382 592 354 548" stroke-width="17"/>
      <path d="M414 666 C394 636 430 614 410 584" stroke-width="13"/>
    </g>'''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.28" r="0.85">
      <stop offset="0" stop-color="{bg0}"/><stop offset="1" stop-color="{bg1}"/>
    </radialGradient>
    <radialGradient id="vig" cx="0.5" cy="0.5" r="0.72">
      <stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/>
    </radialGradient>
    <linearGradient id="chrome" gradientUnits="userSpaceOnUse" x1="222" y1="0" x2="802" y2="0">
      <stop offset="0" stop-color="#7C8492"/><stop offset="0.14" stop-color="#C9CFD8"/><stop offset="0.3" stop-color="#FFFFFF"/>
      <stop offset="0.46" stop-color="#E4E8EE"/><stop offset="0.66" stop-color="#AEB5C0"/><stop offset="0.86" stop-color="#8A929E"/><stop offset="1" stop-color="#5E6572"/>
    </linearGradient>
    <linearGradient id="chromeS" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8A929E"/><stop offset="0.4" stop-color="#F4F6F9"/><stop offset="1" stop-color="#6B7380"/>
    </linearGradient>
    <linearGradient id="shadeV" gradientUnits="userSpaceOnUse" x1="0" y1="388" x2="0" y2="734">
      <stop offset="0" stop-color="#fff" stop-opacity="0.25"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/>
    </linearGradient>
    <linearGradient id="tint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="{accent}"/>
    </linearGradient>
    <linearGradient id="rim" gradientUnits="userSpaceOnUse" x1="222" y1="0" x2="802" y2="0">
      <stop offset="0" stop-color="#9AA2AE"/><stop offset="0.35" stop-color="#FFFFFF"/><stop offset="0.7" stop-color="#C4CAD3"/><stop offset="1" stop-color="#7A828F"/>
    </linearGradient>
    <radialGradient id="knob" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.5" stop-color="#CDD3DB"/><stop offset="1" stop-color="#6E7683"/>
    </radialGradient>
    <linearGradient id="plateEdge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F7F8FA"/><stop offset="1" stop-color="#9CA3AE"/>
    </linearGradient>
    <radialGradient id="plateTop" cx="0.42" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D5DAE1"/>
    </radialGradient>
    <radialGradient id="warm" cx="0.5" cy="0.6" r="0.5">
      <stop offset="0" stop-color="#FFC861" stop-opacity="0.95"/><stop offset="1" stop-color="#FF8A1F" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="blur18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="blur40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#vig)"/>
  <g transform="translate(512 540) scale(1.08) translate(-512 -560)">
  {plate}{glowel}{cloche(lift)}{steam if lift else ""}
  </g>
</svg>'''
open('logo-bestellen.svg','w').write(svg('#2F5BC4', '#0A1838', '#5A86E6', False, False))
open('logo-kueche.svg','w').write(svg('#D9782C', '#4A1805', '#E89A4A', True, True))
