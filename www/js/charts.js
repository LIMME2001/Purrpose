import { fmtDur, MIN } from './core.js';

/** Donut of time per activity/group. segments: [{ms, color}] */
export function donut(segments, total, { size = 176, label = 'tracked' } = {}) {
  const r = 64;
  const sw = 24;
  const C = 2 * Math.PI * r;
  let acc = 0;
  const arcs = total
    ? segments
        .filter((s) => s.ms > 0)
        .map((s) => {
          const len = (s.ms / total) * C;
          const gap = segments.length > 1 ? Math.min(3, len / 3) : 0;
          const out = `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(C - len + gap).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 100 100)"/>`;
          acc += len;
          return out;
        })
        .join('')
    : '';
  return `<div class="donut"><svg viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="${fmtDur(total)} ${label}">
    <circle cx="100" cy="100" r="${r}" fill="none" stroke="#1f2230" stroke-width="${sw}"/>
    ${arcs}
    <text x="100" y="${total ? 104 : 108}" text-anchor="middle" font-size="${fmtDur(total).length > 6 ? 22 : 27}" font-weight="650">${fmtDur(total)}</text>
    <text x="100" y="126" text-anchor="middle" font-size="13" fill="#9a9db4" style="fill:#9a9db4">${label}</text>
  </svg></div>`;
}

/**
 * Stacked bars, one per bucket (a day or a month).
 * buckets: [{ total, label, hot, parts: [{ color, ms }] }]  (label '' hides the axis label, hot highlights "now")
 */
export function stackedBars(buckets, { title = 'Time tracked' } = {}) {
  const W = 420;
  const H = 150;
  const top = 18;
  const bottom = 20;
  const n = buckets.length;
  const gap = n > 40 ? 1 : n > 20 ? 2 : n > 10 ? 3 : 8;
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(30 * MIN, ...buckets.map((b) => b.total));
  const plotH = H - top - bottom;
  const y0 = top + plotH;
  const rx = bw > 6 ? 2 : 0.5;

  const bars = buckets
    .map((b, i) => {
      const x = i * (bw + gap);
      let y = y0;
      const segs = b.parts
        .filter((p) => p.ms > 0)
        .map((p) => {
          const h = Math.max(1.5, (p.ms / max) * plotH);
          y -= h;
          return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="${p.color}"/>`;
        })
        .join('');
      const lab = b.label
        ? `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" ${b.hot ? 'style="fill:#ffc247;font-weight:650"' : ''}>${b.label}</text>`
        : '';
      const empty = b.total === 0 ? `<rect x="${x.toFixed(1)}" y="${y0 - 2}" width="${bw.toFixed(1)}" height="2" rx="1" fill="#1f2230"/>` : '';
      return segs + empty + lab;
    })
    .join('');

  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
    <line x1="0" x2="${W}" y1="${top}" y2="${top}" stroke="#ffffff" stroke-opacity=".07" stroke-dasharray="3 5"/>
    <text x="0" y="${top - 6}">${fmtDur(max)}</text>
    ${bars}
  </svg></div>`;
}
