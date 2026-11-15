// The Purrpose cat. Its eyes are the app's status light:
//   sleep  – nothing running (eyes closed)
//   awake  – tracking (the iris takes the activity's color, pupils are slits)
//   paused – half-lidded
//   happy  – every habit due today is done (eyes curved into smiles, rosy cheeks)
// Extras: a coat (fur colour), a golden glow while you work on a habit you already met, a moon at night.
import { COATS } from './core.js';

const ALMOND = 'M -33 0 Q 0 -31 33 0 Q 0 31 -33 0 Z';
function eye(cx, cy, rot, color, id, fill, ink) {
  return `
  <g transform="translate(${cx} ${cy}) rotate(${rot})">
    <g class="eye-open">
      <g class="blink">
        <path d="${ALMOND}" fill="${color}"/>
        <ellipse cx="-9" cy="-9" rx="10" ry="5" fill="#fff" opacity=".16"/>
        <ellipse rx="4.6" ry="20" fill="#0a0a0f"/>
        <circle cx="-3.5" cy="-8" r="2.6" fill="#fff" opacity=".9"/>
      </g>
    </g>
    <g class="eye-half">
      <clipPath id="${id}"><path d="${ALMOND}"/></clipPath>
      <path d="${ALMOND}" fill="${color}" opacity=".85"/>
      <ellipse rx="4.6" ry="20" fill="#0a0a0f" clip-path="url(#${id})"/>
      <path d="M -40 -34 L 40 -34 L 40 1 Q 0 11 -40 1 Z" fill="${fill}" clip-path="url(#${id})"/>
      <path d="M -33 0 Q 0 10 33 0" stroke="${ink}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".55"/>
    </g>
    <path class="eye-sleep" d="M -27 -1 Q 0 15 27 -1" stroke="${ink}" stroke-width="4.4" stroke-linecap="round" fill="none"/>
    <path class="eye-happy" d="M -27 6 Q 0 -22 27 6" stroke="${ink}" stroke-width="5" stroke-linecap="round" fill="none"/>
  </g>`;
}

/** mode: 'sleep' | 'awake' | 'paused' | 'happy'; color: iris colour while awake; coat: id from COATS. */
export function catHead({ mode = 'sleep', color = '#ffc247', coat = 'midnight', glow = false, night = false } = {}) {
  const k = COATS.find((x) => x.id === coat) || COATS[0];
  const desc = { sleep: 'asleep', paused: 'resting', happy: 'purring happily', awake: 'watching you work' }[mode] || 'asleep';
  return `
<svg class="cat ${glow ? 'has-glow' : ''}" data-mode="${mode}" viewBox="0 0 320 196" role="img" aria-label="Purrpose cat, ${desc}">
  ${glow ? '<ellipse class="halo" cx="160" cy="104" rx="150" ry="100" fill="#ffc247" opacity=".16"/>' : ''}
  <path d="M 38 98 C 33 62 41 32 52 8 L 113 42 C 145 33 175 33 207 42 L 268 8 C 279 32 287 62 282 98 C 278 152 230 188 160 188 C 90 188 42 152 38 98 Z" fill="${k.fill}"/>
  <path d="M 60 30 L 59 56 L 88 45 Z" fill="${k.ear}" opacity=".3"/>
  <path d="M 260 30 L 261 56 L 232 45 Z" fill="${k.ear}" opacity=".3"/>
  ${eye(110, 100, -9, color, 'lidL', k.fill, k.ink)}
  ${eye(210, 100, 9, color, 'lidR', k.fill, k.ink)}
  <g class="cheeks" fill="#ff8fb1" opacity=".38"><ellipse cx="82" cy="134" rx="17" ry="9"/><ellipse cx="238" cy="134" rx="17" ry="9"/></g>
  <path d="M 150 133 L 170 133 L 160 145 Z" fill="#ff8fb1" opacity=".85" stroke="#ff8fb1" stroke-width="3" stroke-linejoin="round"/>
  <path d="M 160 146 L 160 153 M 160 153 Q 151 163 142 156 M 160 153 Q 169 163 178 156" stroke="${k.ink}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".7"/>
  <g class="whisk" stroke="${k.ink}" stroke-width="2" stroke-linecap="round" opacity=".5">
    <path d="M 84 136 L 12 124"/><path d="M 82 148 L 8 150"/><path d="M 86 160 L 22 176"/>
    <path d="M 236 136 L 308 124"/><path d="M 238 148 L 312 150"/><path d="M 234 160 L 298 176"/>
  </g>
  <g class="eye-sleep" fill="${k.ink}" font-weight="700" font-family="Bricolage Grotesque, sans-serif">
    <text class="zzz" x="268" y="52" font-size="22">z</text>
    <text class="zzz" x="286" y="34" font-size="16" style="animation-delay:.5s">z</text>
  </g>
  ${night ? '<g class="moon"><path d="M 20 44 A 20 20 0 1 0 44 70 A 15 15 0 1 1 20 44 Z" fill="#dfe3f5" opacity=".9"/><circle cx="14" cy="24" r="2" fill="#dfe3f5"/><circle cx="34" cy="16" r="1.6" fill="#dfe3f5"/></g>' : ''}
</svg>`;
}

/** Small cat-ear mark for the header. */
export function logoMark() {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 3.5 L11.2 9.6 Q16 8.2 20.8 9.6 L27 3.5 Q28.4 11 27.2 17 Q25.6 27.5 16 27.5 Q6.4 27.5 4.8 17 Q3.6 11 5 3.5 Z" fill="currentColor"/><ellipse cx="11.3" cy="16.3" rx="1.3" ry="3.1" fill="#0e0f14" transform="rotate(-8 11.3 16.3)"/><ellipse cx="20.7" cy="16.3" rx="1.3" ry="3.1" fill="#0e0f14" transform="rotate(8 20.7 16.3)"/></svg>`;
}
