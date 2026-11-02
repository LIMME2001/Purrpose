import { fmtDur, MIN, WEEKDAYS, weekdayIndex } from './core.js';

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
    <text x="100" y="${total ? 104 : 108}" text-anchor="middle" font-size="27" font-weight="650">${fmtDur(total)}</text>
    <text x="100" y="126" text-anchor="middle" font-size="13" fill="#9a9db4" style="fill:#9a9db4">${label}</text>
  </svg></div>`;
}

/** Stacked daily bars. days: [{start, total, parts:[{color, ms}]}] */
export function stackedBars(days, { todayStart, month = false } = {}) {
  const W = 420;
  const H = 150;
  const top = 18;
  const bottom = 20;
  const n = days.length;
  const gap = n > 10 ? 3 : 8;
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(30 * MIN, ...days.map((d) => d.total));
  const plotH = H - top - bottom;
  const y0 = top + plotH;

  const bars = days
    .map((d, i) => {
      const x = i * (bw + gap);
      let y = y0;
      const segs = d.parts
        .filter((p) => p.ms > 0)
        .map((p) => {
          const h = Math.max(1.5, (p.ms / max) * plotH);
          y -= h;
          return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${p.color}"/>`;
        })
        .join('');
      const isToday = d.start === todayStart;
      const dom = new Date(d.start).getDate();
      const label = month ? (dom === 1 || dom % 5 === 0 ? String(dom) : '') : WEEKDAYS[weekdayIndex(d.start)];
      const lab = label
        ? `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" ${isToday ? 'style="fill:#ffc247;font-weight:650"' : ''}>${label}</text>`
        : '';
      const empty = d.total === 0 ? `<rect x="${x.toFixed(1)}" y="${y0 - 2}" width="${bw.toFixed(1)}" height="2" rx="1" fill="#1f2230"/>` : '';
      return segs + empty + lab;
    })
    .join('');

  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Time tracked per day">
    <line x1="0" x2="${W}" y1="${top}" y2="${top}" stroke="#ffffff" stroke-opacity=".07" stroke-dasharray="3 5"/>
    <text x="0" y="${top - 6}">${fmtDur(max)}</text>
    ${bars}
  </svg></div>`;
}
