from shapely.geometry import Point, box, Polygon
from shapely import affinity

def rbox(x0, y0, x1, y1, r):
    return box(x0 + r, y0 + r, x1 - r, y1 - r).buffer(r, quad_segs=32)
def fillet(g, r): return g.buffer(r, quad_segs=32).buffer(-r, quad_segs=32)
def soften(g, r): return g.buffer(-r, quad_segs=32).buffer(r, quad_segs=32)
def to_d(g):
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    out = []
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)
            out.append('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in c[:-1]) + ' Z')
    return ' '.join(out)

def bell():
    dome = affinity.scale(Point(512, 652).buffer(1, quad_segs=96), 282, 300).intersection(box(0, 0, 1024, 652))
    dome = soften(dome, 8)
    stem = box(498, 300, 526, 362)
    knob = rbox(462, 284, 562, 316, 16)
    top = fillet(dome.union(stem), 6).union(fillet(stem.union(knob), 4))
    base = rbox(196, 676, 828, 734, 29)
    return [(top, 'a'), (base, 'b')]

def toque():
    puff = Point(384, 430).buffer(130, quad_segs=96).union(Point(512, 356).buffer(156, quad_segs=96)).union(Point(640, 430).buffer(130, quad_segs=96))
    body = Polygon([(366, 430), (658, 430), (640, 652), (384, 652)])
    hat = soften(fillet(puff.union(body), 18), 16)
    hat = hat.difference(rbox(456, 540, 476, 632, 10).union(rbox(548, 540, 568, 632, 10)))
    band = rbox(380, 674, 644, 760, 26)
    return [(hat, 'a'), (band, 'b')]

def svg(top, bottom, deep, tintA, tintB, layers, cy, strong=False, glow=None):
    from shapely.ops import unary_union
    x0, y0, x1, y1 = unary_union([g for g, _ in layers]).bounds
    dx = 512 - (x0 + x1) / 2
    dy = (cy - (y0 + y1) / 2) if strong else (cy - 512)
    glow = strong if glow is None else glow
    sheen = '<rect width="1024" height="1024" fill="url(#sheen)"/>' if glow else ''
    if strong:
        shadow = f'''<filter id="sh" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="{deep}" flood-opacity="0.38"/>
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="{deep}" flood-opacity="0.34"/>
    </filter>'''
    else:
        shadow = f'<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="{deep}" flood-opacity="0.28"/></filter>'
    body = ''
    for g, kind in layers:
        d = to_d(g)
        body += f'<path d="{d}" fill="url(#{kind})" filter="url(#sh)"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>
    <linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="{tintA}"/></linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{tintB}"/><stop offset="1" stop-color="{tintA}"/></linearGradient>
    <radialGradient id="sheen" cx="0.5" cy="0" r="0.75"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    {shadow}
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  {sheen}
  <g transform="translate({dx:.1f} {dy:.1f})">{body}</g>
</svg>'''

open('logo-bestellen.svg', 'w').write(svg('#FFB33F', '#FF6A00', '#8A3200', '#FFE9CF', '#FFF6EA', bell(), 494, strong=True, glow=False))
open('logo-kueche.svg', 'w').write(svg('#62C6FF', '#0846DB', '#02247A', '#D6E6FF', '#EEF5FF', toque(), 512 - 4, glow=True))
