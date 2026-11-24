// Topographic contour lines: marching squares over a smooth sum-of-sines field.
// Returns one SVG path string (a set of short segments), drawn once and drifted
// with a CSS transform, so the background costs nothing per frame.
const field = (x, y) =>
  Math.sin(x * 1.3 + Math.sin(y * 0.9)) + Math.sin(y * 1.1 + Math.cos(x * 0.7)) + 0.5 * Math.sin((x + y) * 0.6);

export function topoPath(w = 1200, h = 750, { cols = 72, rows = 46, levels = [-1.6, -1.1, -0.6, -0.1, 0.4, 0.9, 1.4] } = {}) {
  const sx = w / cols, sy = h / rows, k = 0.16;
  const v = Array.from({ length: rows + 1 }, (_, j) => Array.from({ length: cols + 1 }, (_, i) => field(i * k, j * k)));
  const out = [];
  for (const L of levels) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = v[j][i], b = v[j][i + 1], c = v[j + 1][i + 1], d = v[j + 1][i];
        const idx = (a > L) | ((b > L) << 1) | ((c > L) << 2) | ((d > L) << 3);
        if (idx === 0 || idx === 15) continue;
        const t = (p, q) => (L - p) / (q - p);
        const top = [(i + t(a, b)) * sx, j * sy], right = [(i + 1) * sx, (j + t(b, c)) * sy];
        const bottom = [(i + t(d, c)) * sx, (j + 1) * sy], left = [i * sx, (j + t(a, d)) * sy];
        const segs = {
          1: [[left, top]], 2: [[top, right]], 3: [[left, right]], 4: [[right, bottom]],
          5: [[left, top], [right, bottom]], 6: [[top, bottom]], 7: [[left, bottom]], 8: [[left, bottom]],
          9: [[top, bottom]], 10: [[left, bottom], [top, right]], 11: [[right, bottom]], 12: [[left, right]],
          13: [[top, right]], 14: [[left, top]],
        }[idx];
        for (const [p, q] of segs) out.push(`M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
      }
    }
  }
  return out.join("");
}
