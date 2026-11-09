// Regenerates land.json (dots on land for the globe). Run once in a scratch folder:
//   npm i world-atlas@2.0.2 topojson-client@3.1.0 && node make_land.mjs 30000
// then copy land.json next to build.py.
import fs from 'fs';
import { feature } from 'topojson-client';
const topo = JSON.parse(fs.readFileSync('node_modules/world-atlas/land-110m.json'));
const land = feature(topo, topo.objects.land);
const polys = [];
for (const f of land.features) {
  const g = f.geometry;
  const list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of list) {
    const rings = p.map(r0 => {
      // unwrap rings that cross the antimeridian so their longitudes run on continuously
      const r = []; let off = 0;
      r0.forEach(([x, y], i) => { if (i) { const d = x + off - r[i - 1][0]; if (d > 180) off -= 360; else if (d < -180) off += 360; } r.push([x + off, y]); }); let a=[180,90,-180,-90]; for (const [x,y] of r){a[0]=Math.min(a[0],x);a[1]=Math.min(a[1],y);a[2]=Math.max(a[2],x);a[3]=Math.max(a[3],y);} return {r, b:a}; });
    polys.push(rings);
  }
}
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inLand = (x, y) => [x, x + 360, x - 360].some(xx => inLand1(xx, y));
const inLand1 = (x, y) => polys.some(rs => { const o = rs[0]; if (x < o.b[0] || x > o.b[2] || y < o.b[1] || y > o.b[3]) return false; if (!inRing(x, y, o.r)) return false; return !rs.slice(1).some(h => inRing(x, y, h.r)); });
const N = +process.argv[2] || 30000, out = [];
const ga = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < N; i++) {
  const y = 1 - 2 * (i + .5) / N, lat = Math.asin(y) * 180 / Math.PI, lon = ((i * ga * 180 / Math.PI) % 360 + 540) % 360 - 180;
  if (lat < -58) continue;
  if (inLand(lon, lat)) out.push(Math.round(lat * 10), Math.round(lon * 10));
}
fs.writeFileSync('land.json', JSON.stringify(out));
console.log(out.length / 2, 'dots', fs.statSync('land.json').size, 'bytes');
