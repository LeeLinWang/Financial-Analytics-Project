// Small dependency-free SVG charts with hover tooltips.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
};

let tooltip;
function tip() {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}
function bindTip(node, html) {
  node.addEventListener('mousemove', (e) => {
    const t = tip();
    t.innerHTML = html;
    t.style.display = 'block';
    t.style.left = `${e.clientX + 14}px`;
    t.style.top = `${e.clientY + 14}px`;
  });
  node.addEventListener('mouseleave', () => { tip().style.display = 'none'; });
}

function niceMax(v) {
  // round 110% of the maximum up to 1, 2, 2.5, 5 or 10 times a power of ten
  if (v <= 0) return 1;
  const target = v * 1.1;
  const p = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * p >= target);
  return step * p;
}

function frame(container, { width = null, height = 300, margin = { t: 16, r: 16, b: 56, l: 64 } } = {}) {
  width = width || Math.max(320, Math.round(container.clientWidth || 640));
  container.innerHTML = '';
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img' });
  container.appendChild(svg);
  return { svg, w: width - margin.l - margin.r, h: height - margin.t - margin.b, m: margin };
}

function yAxis(svg, m, w, h, max, fmt, ticks = null) {
  // choose a tick count whose step is a round number (1, 2, 2.5 or 5 times a power of ten)
  ticks = ticks || [4, 5, 3, 2].find((t) => {
    const s = max / t; const p = 10 ** Math.floor(Math.log10(s));
    return [1, 2, 2.5, 5, 10].some((n) => Math.abs(s / p - n) < 1e-9);
  }) || 4;
  for (let i = 0; i <= ticks; i += 1) {
    const v = (max / ticks) * i;
    const y = m.t + h - (v / max) * h;
    svg.appendChild(el('line', { x1: m.l, x2: m.l + w, y1: y, y2: y, class: 'grid' }));
    svg.appendChild(el('text', { x: m.l - 8, y: y + 4, class: 'tick', 'text-anchor': 'end' }, fmt(v)));
  }
}

// vertical bars; series = [{name, colour, values}], optional highlight index and reference line
export function barChart(container, { labels, series, fmt = (v) => v, tipFmt = fmt, highlight = null, refLine = null, yLabel = '', height = 300 }) {
  const { svg, w, h, m } = frame(container, { height });
  const max = niceMax(Math.max(...series.flatMap((s) => s.values.filter((v) => v !== null)), refLine ? refLine.value : 0));
  yAxis(svg, m, w, h, max, fmt);
  const group = w / labels.length;
  const barW = Math.min(46, (group - 8) / series.length - 2);
  labels.forEach((label, i) => {
    const x0 = m.l + i * group + (group - (barW + 2) * series.length) / 2;
    if (highlight === i) svg.appendChild(el('rect', { x: m.l + i * group + 1, y: m.t, width: group - 2, height: h, class: 'highlight-band' }));
    series.forEach((s, j) => {
      const v = s.values[i];
      if (v === null || v === undefined) return;
      const bh = (v / max) * h;
      const r = el('rect', { x: x0 + j * (barW + 2), y: m.t + h - bh, width: barW, height: Math.max(bh, 0.5), rx: 3, fill: s.colour });
      bindTip(r, `<strong>${label}</strong><br>${s.name}: ${tipFmt(v)}`);
      svg.appendChild(r);
    });
    svg.appendChild(el('text', { x: m.l + i * group + group / 2, y: m.t + h + 18, class: 'tick', 'text-anchor': 'middle' }, label));
  });
  if (refLine) {
    const y = m.t + h - (refLine.value / max) * h;
    svg.appendChild(el('line', { x1: m.l, x2: m.l + w, y1: y, y2: y, class: 'ref-line' }));
    svg.appendChild(el('text', { x: m.l + w, y: y - 6, class: 'ref-label', 'text-anchor': 'end' }, refLine.label));
  }
  svg.appendChild(el('line', { x1: m.l, x2: m.l + w, y1: m.t + h, y2: m.t + h, class: 'axis' }));
  if (yLabel) svg.appendChild(el('text', { x: 14, y: m.t + h / 2, class: 'axis-label', transform: `rotate(-90 14 ${m.t + h / 2})`, 'text-anchor': 'middle' }, yLabel));
  return svg;
}

// line over an ordered x axis with markers
export function lineChart(container, { labels, values, colour, fmt = (v) => v, highlight = null, refLine = null, yLabel = '', height = 260, name = '', max: fixedMax = null }) {
  const { svg, w, h, m } = frame(container, { height });
  const max = fixedMax || niceMax(Math.max(...values, refLine ? refLine.value : 0));
  yAxis(svg, m, w, h, max, fmt);
  const step = w / (labels.length - 1 || 1);
  const pts = values.map((v, i) => [m.l + i * step, m.t + h - (v / max) * h]);
  if (highlight !== null) svg.appendChild(el('line', { x1: pts[highlight][0], x2: pts[highlight][0], y1: m.t, y2: m.t + h, class: 'cutoff-line' }));
  if (refLine) {
    const y = m.t + h - (refLine.value / max) * h;
    svg.appendChild(el('line', { x1: m.l, x2: m.l + w, y1: y, y2: y, class: 'ref-line' }));
    svg.appendChild(el('text', { x: m.l + w, y: y - 6, class: 'ref-label', 'text-anchor': 'end' }, refLine.label));
  }
  svg.appendChild(el('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: colour, 'stroke-width': 2.5 }));
  pts.forEach(([x, y], i) => {
    const c = el('circle', { cx: x, cy: y, r: i === highlight ? 7 : 4.5, fill: colour, stroke: '#faf8f4', 'stroke-width': 2 });
    bindTip(c, `<strong>${labels[i]}</strong><br>${name}: ${fmt(values[i])}`);
    svg.appendChild(c);
    const nearHighlight = highlight !== null && Math.abs(i - highlight) === 1;
    if (i === highlight) svg.appendChild(el('text', { x, y: m.t + h + 20, class: 'tick strong', 'text-anchor': 'middle' }, labels[i]));
    else if (i % 2 === 0 && !nearHighlight && w / labels.length > 14) svg.appendChild(el('text', { x, y: m.t + h + 20, class: 'tick', 'text-anchor': 'middle' }, labels[i]));
  });
  svg.appendChild(el('line', { x1: m.l, x2: m.l + w, y1: m.t + h, y2: m.t + h, class: 'axis' }));
  if (yLabel) svg.appendChild(el('text', { x: 14, y: m.t + h / 2, class: 'axis-label', transform: `rotate(-90 14 ${m.t + h / 2})`, 'text-anchor': 'middle' }, yLabel));
  return svg;
}

// horizontal bars with direct value labels
export function hBarChart(container, { labels, values, colour, fmt = (v) => v, refLines = [], height = null }) {
  const rowH = 30;
  const hgt = height || labels.length * rowH + 50;
  const { svg, w, h, m } = frame(container, { height: hgt, margin: { t: 10, r: 80, b: 30, l: 250 } });
  const max = niceMax(Math.max(...values, ...refLines.map((r) => r.value)));
  labels.forEach((label, i) => {
    const y = m.t + i * (h / labels.length);
    const bh = h / labels.length - 8;
    const bw = (values[i] / max) * w;
    svg.appendChild(el('text', { x: m.l - 10, y: y + bh / 2 + 5, class: 'tick', 'text-anchor': 'end' }, label));
    const r = el('rect', { x: m.l, y, width: Math.max(bw, 1), height: bh, rx: 3, fill: colour });
    bindTip(r, `<strong>${label}</strong><br>${fmt(values[i])}`);
    svg.appendChild(r);
    svg.appendChild(el('text', { x: m.l + Math.max(bw, 1) + 6, y: y + bh / 2 + 5, class: 'value-label' }, fmt(values[i])));
  });
  refLines.forEach((r) => {
    const x = m.l + (r.value / max) * w;
    if (x <= m.l + w) {
      svg.appendChild(el('line', { x1: x, x2: x, y1: m.t, y2: m.t + h, class: 'ref-line' }));
      svg.appendChild(el('text', { x, y: m.t + h + 18, class: 'ref-label', 'text-anchor': 'middle' }, r.label));
    }
  });
  return svg;
}

// waterfall: start value, negative steps, final total
export function waterfall(container, { steps, fmt = (v) => v, height = 280 }) {
  const { svg, w, h, m } = frame(container, { height, margin: { t: 20, r: 16, b: 56, l: 80 } });
  const max = niceMax(steps[0].value);
  yAxis(svg, m, w, h, max, fmt);
  const group = w / steps.length;
  let running = 0;
  steps.forEach((s, i) => {
    const bw = Math.min(90, group - 24);
    const x = m.l + i * group + (group - bw) / 2;
    let top; let bottom;
    if (s.kind === 'start' || s.kind === 'total') { top = s.value; bottom = 0; running = s.value; }
    else { top = running; bottom = running - s.value; running = bottom; }
    const y1 = m.t + h - (top / max) * h; const y2 = m.t + h - (bottom / max) * h;
    const r = el('rect', { x, y: y1, width: bw, height: Math.max(y2 - y1, 1), rx: 3, fill: s.colour });
    bindTip(r, `<strong>${s.label}</strong><br>${s.kind === 'step' ? '-' : ''}${fmt(s.value)}`);
    svg.appendChild(r);
    svg.appendChild(el('text', { x: x + bw / 2, y: y1 - 6, class: 'value-label', 'text-anchor': 'middle' }, `${s.kind === 'step' ? '-' : ''}${fmt(s.value)}`));
    svg.appendChild(el('text', { x: x + bw / 2, y: m.t + h + 18, class: 'tick', 'text-anchor': 'middle' }, s.label));
  });
  svg.appendChild(el('line', { x1: m.l, x2: m.l + w, y1: m.t + h, y2: m.t + h, class: 'axis' }));
  return svg;
}
