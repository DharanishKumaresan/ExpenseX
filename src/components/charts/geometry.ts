/**
 * Shared SVG geometry.
 *
 * The charts in this product are hand-built rather than pulled from a chart
 * library: the visual language (thin radiating rules, hatched bars, hairline
 * axes) is specific enough that theming a general-purpose library would cost
 * more than the maths below, and every mark would still fight the defaults.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Round a coordinate before it reaches the DOM.
 *
 * ECMAScript does not require `Math.sin`/`Math.cos`/`Math.sqrt` to be
 * correctly rounded, so the same expression can differ in its last bit between
 * the V8 build in Node and the one in the browser. Those last bits survive into
 * the serialised SVG attribute ("150.7743496075858" vs "150.77434960758583")
 * and React reports a hydration mismatch on a chart that is visually identical.
 *
 * Three decimals is far finer than a device pixel at any size we render, and it
 * makes the markup byte-identical on both sides.
 */
export function snap(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Angles are degrees clockwise from 12 o'clock. */
export function polar(cx: number, cy: number, radius: number, angleDeg: number): Point {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: snap(cx + radius * Math.cos(radians)),
    y: snap(cy + radius * Math.sin(radians)),
  };
}

/** Filled annulus sector — used for hover targets and donut segments. */
export function annulusSector(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  // A full ring cannot be expressed as a single arc; nudge it closed.
  const end = sweep >= 360 ? startAngle + 359.999 : endAngle;
  const largeArc = end - startAngle > 180 ? 1 : 0;

  const outerStart = polar(cx, cy, outerRadius, startAngle);
  const outerEnd = polar(cx, cy, outerRadius, end);
  const innerEnd = polar(cx, cy, innerRadius, end);
  const innerStart = polar(cx, cy, innerRadius, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

/**
 * Square-root scaling for ray lengths.
 *
 * A linear scale lets one ₹15,000 rent payment flatten forty ₹200 coffees into
 * an indistinguishable stub. Area-proportional (sqrt) keeps the big values
 * dominant while the small ones stay legible.
 */
export function sqrtScale(value: number, max: number, min = 0, range = 1): number {
  if (max <= 0) return min;
  return snap(min + Math.sqrt(Math.max(0, value) / max) * range);
}

export function linearScale(value: number, domainMax: number, rangeMax: number): number {
  if (domainMax <= 0) return 0;
  return snap((Math.max(0, value) / domainMax) * rangeMax);
}

/** Catmull-Rom → cubic Bézier, for smooth series lines without a library. */
export function smoothPath(points: readonly Point[], tension = 0.35): string {
  if (points.length === 0) return '';
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) return `M ${first.x} ${first.y}`;

  let path = `M ${first.x} ${first.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[index + 2] ?? p2;

    const cp1x = snap(p1.x + ((p2.x - p0.x) / 6) * tension * 2);
    const cp1y = snap(p1.y + ((p2.y - p0.y) / 6) * tension * 2);
    const cp2x = snap(p2.x - ((p3.x - p1.x) / 6) * tension * 2);
    const cp2y = snap(p2.y - ((p3.y - p1.y) / 6) * tension * 2);

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

export function linePath(points: readonly Point[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

/** "Nice" axis maximum so gridlines land on round numbers. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}
