/* Time-horizon-only SVG transitions. The chart renderer remains responsible for final geometry. */
import type { ChartConfig } from "./charts.js";

type Point = { x: number; y: number };
type RectGeometry = { x: number; y: number; width: number; height: number };
type BarState = { geometry: RectGeometry; index: number; ordinal: number };
type PathState = { samples: Point[]; index: number };
export interface HorizonSnapshot {
  bars: BarState[];
  caps: PathState[];
  lines: PathState[];
  fills: PathState[];
  heat: Map<string, RectGeometry>;
  grids: number[];
  labels: string[];
}
const ns = "http://www.w3.org/2000/svg";
const read = (node: Element, name: string) => Number(node.getAttribute(name) ?? 0);
const rect = (node: Element): RectGeometry => ({
  x: read(node, "x"), y: read(node, "y"), width: read(node, "width"), height: read(node, "height"),
});
const visible = (node: Element) => !node.closest("defs, mask, clipPath");
const sample = (path: SVGPathElement, count = 96): Point[] => {
  try {
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return [];
    return Array.from({ length: count }, (_, i) => {
      const point = path.getPointAtLength(length * i / (count - 1));
      return { x: point.x, y: point.y };
    });
  } catch { return []; }
};
const interp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const rectNodes = (svg: SVGSVGElement, selector: string) =>
  Array.from(svg.querySelectorAll<SVGRectElement>(selector)).filter(visible);
const pathNodes = (svg: SVGSVGElement, selector: string) =>
  Array.from(svg.querySelectorAll<SVGPathElement>(selector)).filter(visible);
const plottedLines = (svg: SVGSVGElement) =>
  pathNodes(svg, "path[stroke][d]").filter(node => node.getAttribute("fill") === "none" && !node.hasAttribute("data-bar-cap"));
const gradientFills = (svg: SVGSVGElement) =>
  pathNodes(svg, 'path[fill^="url("][d]');
const capPaths = (svg: SVGSVGElement) => pathNodes(svg, "path[data-bar-cap]");
const keys = (config: ChartConfig) =>
  "labels" in config ? config.labels : config.type === "heatmap" ? config.days.map(day => day.date) : [];
const byIndex = (nodes: SVGRectElement[]): BarState[] => {
  const ordinals = new Map<number, number>();
  return nodes.map(node => {
    const index = read(node, "data-bar-index");
    const ordinal = ordinals.get(index) ?? 0;
    ordinals.set(index, ordinal + 1);
    return { geometry: rect(node), index, ordinal };
  });
};
const pathsByIndex = (nodes: SVGPathElement[]): PathState[] =>
  nodes.map((node, index) => ({ index: node.hasAttribute("data-bar-index") ? read(node, "data-bar-index") : index, samples: sample(node, 40) }));
export function captureHorizon(svg: SVGSVGElement, config: ChartConfig): HorizonSnapshot {
  const heat = new Map<string, RectGeometry>();
  const days = config.type === "heatmap" ? config.days : [];
  rectNodes(svg, "rect[data-heat-index]").forEach(node => {
    const day = days[read(node, "data-heat-index")];
    if (day) heat.set(day.date, rect(node));
  });
  return {
    bars: byIndex(rectNodes(svg, "rect[data-bar-index]")),
    caps: pathsByIndex(capPaths(svg)),
    lines: pathsByIndex(plottedLines(svg)),
    fills: pathsByIndex(gradientFills(svg)),
    heat,
    grids: Array.from(svg.querySelectorAll<SVGLineElement>("line")).filter(visible).filter(node => read(node, "x1") !== read(node, "x2")).map(node => read(node, "y1")),
    labels: keys(config),
  };
}
export function animateHorizon(
  svg: SVGSVGElement, previous: HorizonSnapshot, next: ChartConfig, reducedMotion: boolean,
): () => void {
  if (reducedMotion) return () => {};
  const duration = next.type === "line" || next.type === "line-column" ? 550 : next.type === "heatmap" ? 500 : next.type === "column" && next.stacked ? 500 : 450;
  const win = svg.ownerDocument.defaultView;
  if (!win) return () => {};
  const nextLabels = keys(next);
  const oldByLabel = new Map(previous.labels.map((label, i) => [label, i]));
  const priorIndex = (index: number) => oldByLabel.get(nextLabels[index]) ??
    Math.max(0, Math.min(previous.labels.length - 1, index - (nextLabels.length - previous.labels.length)));
  const movements: ((t: number) => void)[] = [];
  const faded = new Set<SVGElement>();
  const opacity = (node: SVGElement, start: number, stagger = 0) => {
    faded.add(node);
    movements.push(t => { node.style.opacity = String(interp(start, 1, Math.max(0, Math.min(1, (t - stagger) / (1 - stagger))))); });
  };
  const tweenRect = (node: SVGRectElement, from: RectGeometry, to: RectGeometry) => {
    movements.push(t => {
      for (const name of ["x", "y", "width", "height"] as const) node.setAttribute(name, String(interp(from[name], to[name], t)));
    });
  };
  const newBars = rectNodes(svg, "rect[data-bar-index]");
  const ordinals = new Map<number, number>();
  newBars.forEach(node => {
    const index = read(node, "data-bar-index");
    const ordinal = ordinals.get(index) ?? 0;
    ordinals.set(index, ordinal + 1);
    const to = rect(node);
    const old = previous.bars.find(bar => bar.index === priorIndex(index) && bar.ordinal === ordinal);
    const from = old?.geometry ?? { x: to.x, y: to.y + to.height, width: to.width, height: 0 };
    tweenRect(node, from, to);
    if (!old) opacity(node, 0, Math.min(.16, index / Math.max(1, nextLabels.length) * .12));
  });
  const tweenPath = (node: SVGPathElement, old: Point[] | undefined, count: number, fadeIfMissing = true) => {
    const target = sample(node, count);
    if (!target.length) return;
    const original = node.getAttribute("d") ?? "";
    if (!old?.length) {
      if (fadeIfMissing) opacity(node, 0);
      return;
    }
    const begin = old.length === count ? old : target.map((_, i) => old[Math.round(i * (old.length - 1) / (count - 1))]);
    movements.push(t => {
      if (t >= 1) { node.setAttribute("d", original); return; }
      const d = target.map((point, i) => {
        const p = begin[i];
        return `${i ? "L" : "M"}${interp(p.x, point.x, t).toFixed(2)},${interp(p.y, point.y, t).toFixed(2)}`;
      }).join(" ");
      node.setAttribute("d", node.getAttribute("fill") !== "none" && original.trimEnd().endsWith("Z") ? d + " Z" : d);
    });
  };
  plottedLines(svg).forEach((node, i) => tweenPath(node, previous.lines[i]?.samples, 96));
  gradientFills(svg).forEach((node, i) => tweenPath(node, previous.fills[i]?.samples, 96));
  capPaths(svg).forEach((node, i) => {
    const newIndex = read(node, "data-bar-index");
    const previousCap = previous.caps.find(cap => cap.index === priorIndex(newIndex));
    tweenPath(node, previousCap?.samples, 40);
  });
  if (next.type === "heatmap") {
    const days = next.days;
    rectNodes(svg, "rect[data-heat-index]").forEach(node => {
      const day = days[read(node, "data-heat-index")];
      if (!day) return;
      const to = rect(node);
      const old = previous.heat.get(day.date);
      if (old) tweenRect(node, old, to);
      else opacity(node, 0, Math.min(.18, read(node, "data-heat-index") / Math.max(1, days.length) * .18));
    });
  }
  const grid = Array.from(svg.querySelectorAll<SVGLineElement>("line")).filter(visible)
    .filter(node => read(node, "x1") !== read(node, "x2"));
  grid.forEach((node, i) => {
    const to = read(node, "y1");
    const from = previous.grids[Math.min(i, previous.grids.length - 1)];
    if (from === undefined) return;
    movements.push(t => {
      const y = String(interp(from, to, t));
      node.setAttribute("y1", y); node.setAttribute("y2", y);
    });
  });
  // Axis labels remain crisp and do not compete with geometrically moving marks.
  svg.querySelectorAll<SVGTextElement>(".viz-axis-label").forEach(node => opacity(node, 0.12));
  if (!movements.length) return () => {};
  let frame = 0;
  let stopped = false;
  const start = win.performance.now();
  const step = (now: number) => {
    if (stopped) return;
    const t = ease(Math.min(1, (now - start) / duration));
    movements.forEach(move => move(t));
    if (t < 1) frame = win.requestAnimationFrame(step);
    else {
      faded.forEach(node => node.style.removeProperty("opacity"));
    }
  };
  // Render the first frame before the next paint, including Firefox.
  movements.forEach(move => move(0));
  frame = win.requestAnimationFrame(step);
  return () => { stopped = true; win.cancelAnimationFrame(frame); };
}
