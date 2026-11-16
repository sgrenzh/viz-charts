import { scaleBand, scaleLinear } from "d3-scale";
import { line } from "d3-shape";

export type ChartConfig = CartesianConfig | HeatmapConfig | StripConfig;
export interface ChartTheme {
  accent?: string;
  background?: string;
  ink?: string;
  muted?: string;
  grid?: string;
  fontFamily?: string;
}
interface BaseConfig {
  version: 1;
  title: string;
  headline?: string;
  period?: string;
  height?: number;
  theme?: ChartTheme;
}
export interface AxisConfig {
  show?: boolean;
  label?: string;
  ticks?: number;
  min?: number;
  max?: number;
  format?: "number" | "compact" | "currency" | "percent";
  digits?: number;
}
export interface Series {
  name: string;
  values: (number | null)[];
  color?: string;
}
interface CartesianConfig extends BaseConfig {
  type: "column" | "line" | "line-column";
  labels: string[];
  series: Series[];
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  grid?: boolean;
  stacked?: boolean;
  barStyle?: "solid" | "cap";
  barRadius?: number;
  barWidth?: number;
  marker?: boolean;
}
interface HeatmapConfig extends BaseConfig {
  type: "heatmap";
  days: { date: string; value: number }[];
  cellSize?: number;
  radius?: number;
  gap?: number;
  thresholds?: number[];
  colors?: string[];
  weekStartsOn?: 0 | 1;
}
interface StripConfig extends BaseConfig {
  type: "strip";
  items: { label: string; value: number; color?: string }[];
  selected?: number;
  legend?: boolean;
}

type Attrs = Record<string, string | number>;
type Shape = { tag: "line" | "rect" | "path" | "circle" | "text"; attrs: Attrs; text?: string };
interface Mark { x: number; y: number; label: string; values: [string, string][] }
interface Layout { width: number; height: number; shapes: Shape[]; marks: Mark[]; clip?: Attrs }
export interface ChartOptions {
  formatValue?: (value: number, axis?: AxisConfig) => string;
  controls?: HTMLElement;
}

let nextChartId = 0;

const color = "var(--viz-accent)";
const muted = "var(--viz-muted)";
const rules = "var(--viz-grid)";
const dayMs = 86_400_000;
const tint = (strength: number) => `color-mix(in srgb, ${color} ${strength}%, var(--viz-surface))`;
const heatColors = [16, 33, 50, 66, 83, 100].map(tint);

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
function svgElement(tag: string, attrs: Attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}
function shape(tag: Shape["tag"], attrs: Attrs, text?: string): Shape {
  return { tag, attrs, text };
}
function label(x: number, y: number, text: string, align = "start") {
  return shape("text", { x, y, fill: muted, "text-anchor": align, "font-size": 11 }, text);
}

function format(value: number, axis?: AxisConfig) {
  const digits = axis?.digits;
  return new Intl.NumberFormat("en", {
    notation: axis?.format === "compact" ? "compact" : "standard",
    style: axis?.format === "currency" ? "currency" : axis?.format === "percent" ? "percent" : "decimal",
    currency: "USD",
    maximumFractionDigits: digits ?? (axis?.format === "compact" ? 1 : 3),
    minimumFractionDigits: digits,
  }).format(value);
}

function cartesian(config: CartesianConfig, width: number, formatValue: typeof format): Layout {
  const height = config.height ?? 272;
  const showX = config.xAxis?.show !== false;
  const showY = config.yAxis?.show !== false;
  const left = 24;
  const right = width - (showY ? (width < 420 ? 48 : 72) : 24);
  const top = 12;
  const bottom = height - (showX ? 32 : 12);
  const combo = config.type === "line-column";
  const column = config.type === "column";
  const main = combo ? config.series.slice(0, 1) : config.series;
  const indexes = config.labels.map((_, i) => String(i));
  const band = scaleBand(indexes, [left, right]).paddingInner(column ? 0.12 : 0.08);
  const center = (i: number) => (band(String(i)) ?? left) + band.bandwidth() / 2;
  const values = main.flatMap(series => series.values.flatMap(v => v == null ? [] : [v]));
  const stack = column && config.stacked;
  if (stack) {
    for (let i = 0; i < indexes.length; i++) {
      const row = main.map(series => series.values[i] ?? 0);
      values.push(row.reduce((sum, v) => sum + Math.max(0, v), 0));
      values.push(row.reduce((sum, v) => sum + Math.min(0, v), 0));
    }
  }
  const low = values.reduce((a, b) => Math.min(a, b), column ? 0 : Infinity);
  const high = values.reduce((a, b) => Math.max(a, b), column ? 0 : -Infinity);
  const min = config.yAxis?.min ?? (Number.isFinite(low) ? low : 0);
  const max = config.yAxis?.max ?? (Number.isFinite(high) ? Math.max(high, min + Number.EPSILON * Math.max(1, Math.abs(min)) * 2) : min + 1);
  const lineBottom = combo ? bottom - 44 : bottom;
  const y = scaleLinear([min, max], [lineBottom, top]).clamp(true);
  if (config.yAxis?.min === undefined && config.yAxis?.max === undefined) y.nice(config.yAxis?.ticks ?? 4);

  const shapes: Shape[] = [];
  const ticks = y.ticks(config.yAxis?.ticks ?? 4);
  ticks.forEach(value => {
    if (config.grid !== false) shapes.push(shape("line", { x1: left, y1: y(value), x2: right, y2: y(value), stroke: rules }));
    if (showY) shapes.push(label(right + 8, y(value) + 4, formatValue(value, config.yAxis)));
  });
  if (showX && indexes.length) {
    const count = Math.max(2, Math.min(config.xAxis?.ticks ?? 12, Math.floor((right - left) / 45), indexes.length));
    const visible = new Set(Array.from({ length: count }, (_, i) => Math.round(i * (indexes.length - 1) / (count - 1))));
    visible.forEach(i => shapes.push(label(center(i), height - 12, config.labels[i], "middle")));
  }
  if (showX && config.xAxis?.label) shapes.push(label((left + right) / 2, height - 1, config.xAxis.label, "middle"));
  if (showY && config.yAxis?.label) shapes.push(label(right + 8, top, config.yAxis.label));

  const getColor = (series: Series, i: number) => series.color ?? (i ? tint(50) : color);
  if (column) {
    const start = indexes.map(() => ({ pos: 0, neg: 0 }));
    main.forEach((series, s) => {
      const groups = stack ? 1 : main.length;
      const w = Math.min(config.barWidth ?? Infinity, band.bandwidth() / groups);
      series.values.slice(0, indexes.length).forEach((v, i) => {
        if (v == null) return;
        const side = v >= 0 ? "pos" : "neg";
        const base = stack ? start[i][side] : 0;
        if (stack) start[i][side] += v;
        const endY = y(base + v);
        const barY = Math.min(y(base), endY);
        const barHeight = Math.abs(y(base) - endY);
        const x = center(i) - w * groups / 2 + (stack ? 0 : s * w);
        const fill = getColor(series, s);
        shapes.push(shape("rect", { x, y: barY, width: w, height: barHeight, rx: config.barRadius ?? 0, fill, opacity: config.barStyle === "cap" ? 0.12 : 1 }));
        if (config.barStyle === "cap" && barHeight) {
          const cap = Math.min(2, barHeight);
          const r = Math.min(cap, w / 2);
          const edge = v >= 0 ? barY : barY + barHeight;
          const inside = edge + (v >= 0 ? cap : -cap);
          const d = `M${x},${inside} Q${x},${edge} ${x + r},${edge} H${x + w - r} Q${x + w},${edge} ${x + w},${inside} Z`;
          shapes.push(shape("path", { d, fill }));
        }
      });
    });
  } else {
    if (combo && config.series[1]) {
      const volume = config.series[1];
      const maxVolume = volume.values.reduce<number>((max, v) => Math.max(max, v ?? 0), 1);
      const volumeY = scaleLinear([0, maxVolume], [bottom, bottom - 36]).clamp(true);
      volume.values.slice(0, indexes.length).forEach((v, i) => {
        if (v == null) return;
        const w = Math.max(1, band.bandwidth() * 0.7);
        shapes.push(shape("rect", { x: center(i) - w / 2, y: volumeY(v), width: w, height: bottom - volumeY(v), fill: volume.color ?? "#C8C7CB" }));
      });
    }
    main.forEach((series, i) => {
      const plotted = series.values.slice(0, indexes.length);
      const d = line<number | null>().defined(v => v !== null).x((_, j) => center(j)).y(v => y(v ?? 0))(plotted);
      if (d) shapes.push(shape("path", { d, fill: "none", stroke: getColor(series, i), "stroke-width": 1.5, "stroke-linejoin": "round" }));
      const last = plotted.findLastIndex(v => v != null);
      if (config.marker && last >= 0) shapes.push(shape("circle", { cx: center(last), cy: y(plotted[last] ?? 0), r: 4, fill: getColor(series, i) }));
    });
  }
  const marks = config.labels.map((name, i) => ({
    label: name,
    x: center(i),
    y: y(main[0]?.values[i] ?? min),
    values: config.series.map((s, j): [string, string] =>
      [s.name, s.values[i] == null ? "—" : formatValue(s.values[i]!, combo && j === 1 ? undefined : config.yAxis)]),
  }));
  return { width, height, shapes, marks };
}

function heatmap(config: HeatmapConfig, available: number, formatValue: typeof format): Layout {
  const size = config.cellSize ?? 24;
  const gap = config.gap ?? 4;
  const stride = size + gap;
  const thresholds = config.thresholds ?? [1, 2, 4, 8, 16];
  const palette = config.colors ?? heatColors;
  const weekStart = config.weekStartsOn ?? 0;
  const data = new Map(config.days.map(({ date, value }) => [Date.parse(date), value]));
  const dates = [...data.keys()].sort((a, b) => a - b);
  const start = dates[0] ?? 0;
  const first = start - ((new Date(start).getUTCDay() - weekStart + 7) % 7) * dayMs;
  const count = dates.length ? Math.floor((dates[dates.length - 1] - first) / dayMs) + 1 : 0;
  const shapes: Shape[] = [];
  const marks: Mark[] = [];
  let month = "";
  for (let i = 0; i < count; i++) {
    const x = 24 + Math.floor(i / 7) * stride;
    const y = 8 + i % 7 * stride;
    const date = new Date(first + i * dayMs);
    const value = data.get(date.getTime());
    const level = value === undefined ? -1 : thresholds.filter(t => value >= t).length;
    shapes.push(shape("rect", { x, y, width: size, height: size, rx: config.radius ?? 4, fill: level < 0 ? rules : palette[Math.min(level, palette.length - 1)] ?? color }));
    const current = date.toLocaleDateString("en", { month: "short", timeZone: "UTC" });
    if (current !== month && (i % 7 === 0 || i === 0)) {
      shapes.push(label(x, stride * 7 + 24, current));
      month = current;
    }
    if (value !== undefined) marks.push({
      x: x + size / 2, y: y + size / 2, label: date.toISOString().slice(0, 10),
      values: [[config.title, formatValue(value)]],
    });
  }
  return { width: Math.max(available, 48 + Math.ceil(count / 7) * stride), height: stride * 7 + 36, shapes, marks };
}

function strip(config: StripConfig, width: number, formatValue: typeof format): Layout {
  const height = config.height ?? 276;
  const total = config.items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const shapes: Shape[] = [];
  const marks: Mark[] = [];
  let x = 24;
  const chartWidth = width - 48;
  config.items.forEach((item, i) => {
    const share = total ? Math.max(0, item.value) / total : 0;
    const w = chartWidth * share;
    const fill = item.color ?? (i === config.selected ? color : tint(33));
    if (w > 0) shapes.push(shape("rect", { x, y: 0, width: w, height, fill, stroke: "var(--viz-surface)" }));
    marks.push({ label: item.label, x: x + w / 2, y: height / 2, values: [[item.label, formatValue(item.value)], ["Share", formatValue(share, { format: "percent", digits: 1 })]] });
    x += w;
  });
  return { width, height, shapes, marks, clip: { x: 24, y: 0, width: chartWidth, height, rx: 8 } };
}

export function chartLayout(config: ChartConfig, width: number, options: ChartOptions = {}): Layout {
  const formatValue = options.formatValue ?? format;
  if (config.type === "heatmap") return heatmap(config, width, formatValue);
  if (config.type === "strip") return strip(config, width, formatValue);
  return cartesian(config, width, formatValue);
}

export function mountChart(host: HTMLElement, initial: ChartConfig, options: ChartOptions = {}) {
  let config = initial;
  let width = -1;
  let active = -1;
  let pinned = false;
  let layout: Layout;
  const card = element("section", "viz-card");
  const header = element("header", "viz-heading");
  const chartBody = element("div", "viz-body");
  const scroller = element("div", "viz-plot");
  const tooltip = element("div", "viz-tooltip");
  const clipId = "viz-strip-clip-" + ++nextChartId;
  const svg = svgElement("svg", { role: "img" });
  tooltip.hidden = true;
  tooltip.setAttribute("role", "status");
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "group");
  scroller.setAttribute("aria-label", "Plot. Use arrow keys to explore the values.");
  scroller.append(svg);
  card.append(header, chartBody, tooltip);
  chartBody.append(scroller);
  host.replaceChildren(card);

  function display(index: number) {
    active = index;
    const mark = layout?.marks[index];
    tooltip.hidden = !mark;
    if (!mark) return;
    const title = element("strong");
    title.textContent = mark.label;
    const rows = mark.values.map(([name, value]) => {
      const row = element("div");
      row.textContent = name + "  " + value;
      return row;
    });
    tooltip.replaceChildren(title, ...rows);
    const cardBounds = card.getBoundingClientRect();
    const plotBounds = scroller.getBoundingClientRect();
    const offset = plotBounds.left - cardBounds.left + mark.x - scroller.scrollLeft;
    tooltip.style.left = Math.max(12, Math.min(card.clientWidth - tooltip.offsetWidth - 12, offset + 12)) + "px";
    tooltip.style.top = Math.max(12, plotBounds.top - cardBounds.top + mark.y - tooltip.offsetHeight - 8) + "px";
  }

  function draw() {
    const nextWidth = Math.floor(scroller.clientWidth);
    if (nextWidth < 96 || width === nextWidth) return;
    width = nextWidth;
    pinned = false;
    layout = chartLayout(config, width, options);
    svg.setAttribute("viewBox", "0 0 " + layout.width + " " + layout.height);
    svg.setAttribute("width", String(layout.width));
    svg.setAttribute("height", String(layout.height));
    svg.setAttribute("aria-label", config.title);
    const marks = layout.shapes.map(({ tag, attrs, text }) => {
      const node = svgElement(tag, attrs);
      if (text !== undefined) node.textContent = text;
      return node;
    });
    if (layout.clip) {
      const clip = svgElement("clipPath", { id: clipId });
      clip.append(svgElement("rect", layout.clip));
      const group = svgElement("g", { "clip-path": `url(#${clipId})` });
      group.append(...marks);
      svg.replaceChildren(clip, group);
    } else {
      svg.replaceChildren(...marks);
    }
    display(-1);
  }

  function render() {
    const themeKeys = { accent: "accent", background: "surface", ink: "ink", muted: "muted", grid: "grid", fontFamily: "font" } as const;
    Object.entries(themeKeys).forEach(([key, token]) => {
      const value = config.theme?.[key as keyof ChartTheme];
      if (value) card.style.setProperty("--viz-" + token, value);
      else card.style.removeProperty("--viz-" + token);
    });
    card.dataset.chart = config.type;
    const title = element("h2");
    title.textContent = config.title;
    header.replaceChildren(title);
    if (options.controls) {
      header.append(options.controls);
    } else if (config.period) {
      const period = element("span", "viz-period");
      period.textContent = config.period;
      header.append(period);
    }
    if (config.headline) {
      const headline = element("p", "viz-headline");
      headline.textContent = config.headline;
      header.append(headline);
    }
    chartBody.querySelector(".viz-legend")?.remove();
    header.querySelector(".viz-series")?.remove();
    if (config.type === "strip" && config.legend !== false) {
      const legend = element("div", "viz-legend");
      config.items.forEach((item, i) => {
        const button = element("button");
        const name = element("span");
        const value = element("span");
        name.textContent = item.label;
        value.textContent = (options.formatValue ?? format)(item.value);
        button.append(name, value);
        button.addEventListener("focus", () => display(i));
        button.addEventListener("blur", () => display(-1));
        button.addEventListener("click", () => display(i));
        legend.append(button);
      });
      chartBody.append(legend);
    } else if ("series" in config && config.series.length > 1 && config.type !== "line-column") {
      const legend = element("div", "viz-series");
      config.series.forEach((series, i) => {
        const item = element("span");
        item.style.setProperty("--series-color", series.color ?? (i ? tint(50) : color));
        item.textContent = series.name;
        legend.append(item);
      });
      header.append(legend);
    }
    width = -1;
    draw();
  }
  function closest(event: PointerEvent) {
    const bounds = svg.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    let closest = -1;
    let distance = Infinity;
    layout.marks.forEach((mark, i) => {
      const d = Math.abs(mark.x - x) + (config.type === "heatmap" ? Math.abs(mark.y - y) : 0);
      if (d < distance) { closest = i; distance = d; }
    });
    return closest;
  }
  svg.addEventListener("pointermove", event => { if (!pinned && event.pointerType !== "touch") display(closest(event)); });
  svg.addEventListener("pointerup", event => { pinned = true; display(closest(event)); });
  svg.addEventListener("pointerleave", () => { if (!pinned) display(-1); });
  scroller.addEventListener("blur", () => { pinned = false; display(-1); });
  scroller.addEventListener("keydown", event => {
    if (event.key === "Escape") { pinned = false; display(-1); return; }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !layout.marks.length) return;
    event.preventDefault();
    const last = layout.marks.length - 1;
    const index = event.key === "Home" ? 0 : event.key === "End" ? last
      : Math.max(0, Math.min(last, active + (event.key === "ArrowLeft" ? -1 : 1)));
    const x = layout.marks[index].x;
    if (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = x - scroller.clientWidth / 2;
    display(index);
  });
  const observer = new ResizeObserver(draw);
  render();
  observer.observe(scroller);
  return {
    update(next: ChartConfig) { config = next; render(); },
    getData() {
      const data = layout ?? chartLayout(config, 320, options);
      return data.marks.flatMap(mark => mark.values.map(([series, value]) => ({ label: mark.label, series, value })));
    },
    destroy() { observer.disconnect(); card.remove(); },
  };
}
