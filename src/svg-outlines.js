import { packedToHex } from './canvas-model.js';

// Appends one <path> per colour: the merged outline of every pixel of that
// colour, instead of pushRects's one rect per horizontal run. Touching pixels
// fuse into a single closed contour and holes become their own sub-contours
// (opposite winding, so the default nonzero fill leaves them empty). That is
// what glyph and font tools want: real shapes, not a pile of abutting boxes.
//
// Every pixel contributes its four edges, wound clockwise. An edge shared by
// two pixels appears once in each direction and cancels, leaving only the
// boundary; the loops are then chased edge to edge. Vertices are numbered
// y * (w + 1) + x. Cost is linear in the pixel count.
export function pushOutlines(parts, pixels, w, h, ox, oy, scale) {
  const stride = w + 1;
  const vertexCount = stride * (h + 1);
  const byColor = new Map(); // colour -> Set of directed edge ids (from * vertexCount + to)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = pixels[y * w + x];
      if (!c) continue;
      let edges = byColor.get(c);
      if (!edges) byColor.set(c, edges = new Set());
      const tl = y * stride + x, tr = tl + 1, bl = tl + stride, br = bl + 1;
      for (const [from, to] of [[tl, tr], [tr, br], [br, bl], [bl, tl]]) {
        const reverse = to * vertexCount + from;
        if (!edges.delete(reverse)) edges.add(from * vertexCount + to);
      }
    }
  }

  for (const [c, edges] of byColor) {
    const out = new Map(); // vertex -> vertices its remaining edges lead to
    for (const id of edges) {
      const from = Math.floor(id / vertexCount);
      const list = out.get(from);
      if (list) list.push(id - from * vertexCount); else out.set(from, [id - from * vertexCount]);
    }
    let d = '';
    for (const [start, list] of out) {
      while (list.length) {
        const loop = [start];
        for (let v = list.pop(); v !== start; v = out.get(v).pop()) loop.push(v);
        d += contourPath(loop, stride, ox, oy, scale);
      }
    }
    parts.push(`<path fill="${packedToHex(c)}" d="${d}"/>`);
  }
}

// A closed loop of vertices as `M x y` plus H/V moves. Vertices in the middle
// of a straight run add nothing, so are skipped.
function contourPath(loop, stride, ox, oy, scale) {
  const n = loop.length;
  const px = (v) => (ox + (v % stride)) * scale, py = (v) => (oy + Math.floor(v / stride)) * scale;
  const corners = loop.filter((v, i) => {
    const a = loop[(i + n - 1) % n], b = loop[(i + 1) % n];
    return !((px(a) === px(v) && px(v) === px(b)) || (py(a) === py(v) && py(v) === py(b)));
  });
  let d = `M${px(corners[0])} ${py(corners[0])}`;
  for (let i = 1; i < corners.length; i++) {
    d += px(corners[i]) === px(corners[i - 1]) ? `V${py(corners[i])}` : `H${px(corners[i])}`;
  }
  return d + 'Z';
}
