import { scaleTime } from 'd3';

const DAY = 864e5;

/**
 * Time domain for the whole body of work. If there is a long stretch with no
 * published pieces (over 18 months), it is squeezed into a thin band so the
 * recent work stays readable.
 */
export function timeDomain(dates) {
  const sorted = [...dates].sort((a, b) => a - b);
  const start = new Date(+sorted[0] - 90 * DAY);
  const end = new Date(+sorted[sorted.length - 1] + 200 * DAY);
  let gap = null;
  for (let i = 1; i < sorted.length; i++) {
    const span = sorted[i] - sorted[i - 1];
    if (span > 540 * DAY && (!gap || span > gap.span)) {
      gap = { span, a: new Date(+sorted[i - 1] + 75 * DAY), b: new Date(+sorted[i] - 75 * DAY) };
    }
  }
  return { start, end, gap };
}

/** Scale over [r0, r1]; the gap gets gapFrac of the width and the part after it rightFrac. */
export function tscale(dom, r0, r1, gapFrac = 0.045, rightFrac = 0.2) {
  const { start, end, gap } = dom;
  if (!gap) {
    const s = scaleTime([start, end], [r0, r1]);
    s.gap = null;
    return s;
  }
  const gapW = (r1 - r0) * gapFrac;
  const xa = r0 + ((r1 - r0) - gapW) * (1 - rightFrac);
  const s = scaleTime([start, gap.a, gap.b, end], [r0, xa, xa + gapW, r1]);
  s.gap = [xa, xa + gapW];
  return s;
}

/** Year ticks that skip the squeezed gap, plus a label where the timeline resumes. */
export function yearTicks(dom) {
  const { start, end, gap } = dom;
  const ticks = [];
  for (let y = start.getFullYear() + 1; y <= end.getFullYear(); y++) {
    const d = new Date(y, 0, 1);
    if (d > end) break;
    if (gap && d > gap.a && d < gap.b) continue;
    ticks.push({ d, label: String(y) });
  }
  if (gap && !ticks.some((t) => t.d.getFullYear() === gap.b.getFullYear() && t.d >= gap.b)) {
    ticks.push({ d: gap.b, label: String(gap.b.getFullYear()) });
    ticks.sort((a, b) => a.d - b.d);
  }
  return ticks;
}
