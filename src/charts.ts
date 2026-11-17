import { scaleBand, scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";

export type ChartConfig = CartesianConfig | HeatmapConfig | StripConfig;
export type LegendPosition = "below" | "right" | "left";
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
  gradientFill?: boolean;
  showVolume?: boolean;
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
  legendPosition?: LegendPosition;
}

type Attrs = Record<string, string | number>;
type Shape = { tag: "line" | "rect" | "path" | "circle" | "text"; attrs: Attrs; text?: string };
interface Mark {
  x: number;
  y: number;
  label: string;
  values: [string, string][];
  colors: string[];
  points?: { y: number; color: string }[];
}
interface LineFill { path: string; color: string; top: number; bottom: number }
interface Layout { width: number; height: number; shapes: Shape[]; marks: Mark[]; clip?: Attrs; lineFill?: LineFill }
export interface ChartOptions {
  formatValue?: (value: number, axis?: AxisConfig) => string;
  formatHeadline?: (value: number) => string;
  controls?: HTMLElement;
}

let nextChartId = 0;

const color = "var(--viz-accent)";
const muted = "var(--viz-muted)";
const rules = "var(--viz-grid)";
const axisLabelSize = 12;
const dayMs = 86_400_000;
const tint = (strength: string, base = color) => `color-mix(in srgb, ${base} ${strength}, var(--viz-surface))`;
const secondaryColor = tint("var(--viz-page-secondary-strength, 50%)");
const heatColors = [16, 33, 50, 66, 83, 100].map(strength =>
  tint(`calc(${strength}% + ${100 - strength}% * var(--viz-page-heatmap-lift, 0))`));

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
  return shape("text", { x, y, fill: muted, "text-anchor": align, "font-size": axisLabelSize, class: "viz-axis-label" }, text);
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

function estimateAxisLabelWidth(text: string) {
  // Estimate glyph widths without requiring a browser or a loaded font.
  return Array.from(text).reduce((pixels, character) => {
    const em = character === " " ? 0.35 : character.charCodeAt(0) < 128 ? 0.75 : 1;
    return pixels + axisLabelSize * em;
  }, 0);
}

function xAxisLabels(labels: string[], maxTicks: number, width: number, y: number, center: (index: number) => number) {
  // Repeated labels can represent sub-day samples. Count each run once for axis spacing.
  const candidates = labels.flatMap((text, index) => {
    if (!text || text === labels[index - 1]) return [];
    const textWidth = Math.min(width, estimateAxisLabelWidth(text));
    const x = center(index);
    const start = Math.max(0, Math.min(width - textWidth, x - textWidth / 2));
    return [{ text, x, textWidth, start, end: start + textWidth }];
  });

  // Give short category lists one label per category, even when the plot is narrow.
  if (labels.length <= 6 && candidates.length <= maxTicks) {
    return candidates.map(({ text, x, textWidth }, i) => {
      const previous = i ? (candidates[i - 1].x + x) / 2 : 0;
      const next = i < candidates.length - 1 ? (x + candidates[i + 1].x) / 2 : width;
      const available = Math.max(1, next - previous - 4);
      const length = Math.min(available, textWidth);
      const tick = label(Math.max(previous + length / 2, Math.min(next - length / 2, x)), y, text, "middle");
      if (available < textWidth) Object.assign(tick.attrs, { textLength: length, lengthAdjust: "spacingAndGlyphs" });
      return tick;
    });
  }

  const firstStep = Math.max(1, Math.ceil(candidates.length / Math.max(2, maxTicks)));
  const gap = 8;
  // Widen the interval for the whole axis when two labels would overlap.
  for (let step = firstStep; step <= candidates.length; step++) {
    const ticks: Shape[] = [];
    let previousEnd = -Infinity;
    let i = 0;
    for (; i < candidates.length; i += step) {
      const { text, start, end } = candidates[i];
      if (start < previousEnd + gap) break;
      ticks.push(label((start + end) / 2, y, text, "middle"));
      previousEnd = end;
    }
    if (i >= candidates.length) return ticks;
  }
  return [];
}

function cartesian(config: CartesianConfig, width: number, formatValue: typeof format): Layout {
  const height = config.height ?? 272;
  const showX = config.xAxis?.show !== false;
  const showY = config.yAxis?.show !== false;
  const left = 0;
  const top = 12;
  const bottom = height - (showX ? 32 : 12);
  const combo = config.type === "line-column";
  const showVolume = combo && config.showVolume !== false;
  const column = config.type === "column";
  const main = combo ? config.series.slice(0, 1) : config.series;
  const indexes = config.labels.map((_, i) => String(i));
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
  const lineBottom = showVolume ? bottom - 44 : bottom;
  const y = scaleLinear([min, max], [lineBottom, top]).clamp(true);
  if (config.yAxis?.min === undefined && config.yAxis?.max === undefined) y.nice(config.yAxis?.ticks ?? 4);

  const ticks = y.ticks(config.yAxis?.ticks ?? 4);
  const tickLabels = showY ? ticks.map(value => formatValue(value, config.yAxis)) : [];
  const axisTitle = config.yAxis?.label;
  const labelGap = 8;
  const minRightPadding = width < 420 ? 48 : 72;
  const longestLabel = tickLabels.reduce((longest, text) => Math.max(longest, estimateAxisLabelWidth(text)),
    showY && axisTitle ? estimateAxisLabelWidth(axisTitle) : 0);
  const rightPadding = showY ? Math.max(minRightPadding, longestLabel + labelGap + 2) : 0;
  const right = Math.max(left + 1, width - rightPadding);
  const band = scaleBand(indexes, [left, right]).paddingInner(column ? 0.12 : 0.08);
  const center = (i: number) => (band(String(i)) ?? left) + band.bandwidth() / 2;

  const shapes: Shape[] = [];
  ticks.forEach((value, i) => {
    if (config.grid !== false) shapes.push(shape("line", { x1: left, y1: y(value), x2: right, y2: y(value), stroke: rules }));
    if (showY) shapes.push(label(right + labelGap, y(value) + 4, tickLabels[i]));
  });
  if (showX) shapes.push(...xAxisLabels(config.labels, config.xAxis?.ticks ?? 12, width, height - 12, center));
  if (showX && config.xAxis?.label) shapes.push(label((left + right) / 2, height - 1, config.xAxis.label, "middle"));
  if (showY && axisTitle) shapes.push(label(right + labelGap, top, axisTitle));

  const getColor = (series: Series, i: number) => series.color ?? (combo && i === 1 ? "var(--viz-volume, #C8C7CB)" : i ? secondaryColor : color);
  let lineFill: LineFill | undefined;
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
        shapes.push(shape("rect", { x, y: barY, width: w, height: barHeight, rx: config.barRadius ?? 0, fill, opacity: config.barStyle === "cap" ? "var(--viz-page-cap-opacity, 0.12)" : 1 }));
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
    if (showVolume && config.series[1]) {
      const volume = config.series[1];
      const maxVolume = volume.values.reduce<number>((max, v) => Math.max(max, v ?? 0), 1);
      const volumeY = scaleLinear([0, maxVolume], [bottom, bottom - 36]).clamp(true);
      volume.values.slice(0, indexes.length).forEach((v, i) => {
        if (v == null) return;
        const w = Math.max(1, band.bandwidth() * 0.7);
        shapes.push(shape("rect", { x: center(i) - w / 2, y: volumeY(v), width: w, height: bottom - volumeY(v), fill: getColor(volume, 1) }));
      });
    }
    main.forEach((series, i) => {
      const plotted = series.values.slice(0, indexes.length);
      const d = line<number | null>().defined(v => v !== null).x((_, j) => center(j)).y(v => y(v ?? 0))(plotted);
      const stroke = getColor(series, i);
      if (d) shapes.push(shape("path", { d, fill: "none", stroke, "stroke-width": 1.5, "stroke-linejoin": "round" }));
      if (config.gradientFill && i === 0) {
        const path = area<number | null>().defined(v => v !== null).x((_, j) => center(j)).y0(lineBottom).y1(v => y(v ?? 0))(plotted);
        if (path) lineFill = { path, color: stroke, top, bottom: lineBottom };
      }
    });
  }
  const visibleSeries = combo && !showVolume ? main : config.series;
  const colors = visibleSeries.map(getColor);
  const marks = config.labels.map((name, i): Mark => {
    const points = column ? undefined : main.flatMap((series, j) => {
      const value = series.values[i];
      return value == null ? [] : [{ y: y(value), color: colors[j] }];
    });
    return {
      label: name,
      x: center(i),
      y: points?.[0]?.y ?? y(main[0]?.values[i] ?? min),
      values: visibleSeries.map((series, j) => [
        series.name, series.values[i] == null ? "—" : formatValue(series.values[i]!, combo && j === 1 ? undefined : config.yAxis),
      ]),
      colors,
      points,
    };
  });
  return { width, height, shapes, marks, ...(lineFill ? { lineFill } : {}) };
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
    const x = Math.floor(i / 7) * stride;
    const y = 8 + i % 7 * stride;
    const date = new Date(first + i * dayMs);
    const value = data.get(date.getTime());
    const level = value === undefined ? -1 : thresholds.filter(t => value >= t).length;
    const fill = level < 0 ? rules : palette[Math.min(level, palette.length - 1)] ?? color;
    shapes.push(shape("rect", { x, y, width: size, height: size, rx: config.radius ?? 4, fill }));
    const current = date.toLocaleDateString("en", { month: "short", timeZone: "UTC" });
    if (current !== month && (i % 7 === 0 || i === 0)) {
      shapes.push(label(x, stride * 7 + 24, current));
      month = current;
    }
    if (value !== undefined) marks.push({
      x: x + size / 2, y: y + size / 2, label: date.toISOString().slice(0, 10),
      values: [[config.title, formatValue(value)]], colors: [fill],
    });
  }
  const gridWidth = count ? Math.ceil(count / 7) * stride - gap : 0;
  return { width: Math.max(available, gridWidth), height: stride * 7 + 36, shapes, marks };
}

function stripTotal(items: StripConfig["items"]) {
  return items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
}

function stripShare(value: number, total: number) {
  return total ? Math.max(0, value) / total : 0;
}

function stripFill(item: StripConfig["items"][number], index: number, selected: number) {
  const base = item.color ?? color;
  return index === selected || (selected < 0 && item.color) ? base : tint("var(--viz-page-strip-strength, 38%)", base);
}

const shareFormat: AxisConfig = { format: "percent", digits: 1 };

function strip(config: StripConfig, width: number, formatValue: typeof format): Layout {
  const height = config.height ?? 276;
  const total = stripTotal(config.items);
  const requestedSelection = config.selected ?? -1;
  const selected = config.items[requestedSelection] ? requestedSelection : -1;
  const shapes: Shape[] = [];
  const marks: Mark[] = [];
  let x = 0;
  config.items.forEach((item, i) => {
    const share = stripShare(item.value, total);
    const w = width * share;
    const fill = stripFill(item, i, selected);
    if (w > 0) shapes.push(shape("rect", {
      x, y: 0, width: w, height, fill, stroke: "var(--viz-surface)", "stroke-width": 2,
      class: "viz-strip-segment", "data-strip-index": i,
    }));
    marks.push({
      label: item.label, x: x + w / 2, y: height / 2,
      values: [[item.label, formatValue(item.value)], ["Share", formatValue(share, shareFormat)]],
      colors: [fill, fill],
    });
    x += w;
  });
  return { width, height, shapes, marks, clip: { x: 0, y: 0, width, height, rx: 8 } };
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
  let linePointer: number | null = null;
  let headline: HTMLParagraphElement | undefined;
  let previousHeadline = "";
  const reducedMotion = host.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
  let stripSelection = initial.type === "strip" ? initial.selected ?? -1 : -1;
  let layout: Layout;
  let stripRows: HTMLButtonElement[] = [];
  const card = element("section", "viz-card");
  const header = element("header", "viz-heading");
  const chartBody = element("div", "viz-body");
  const scroller = element("div", "viz-plot");
  const tooltip = element("div", "viz-tooltip");
  const chartId = ++nextChartId;
  const clipId = "viz-strip-clip-" + chartId;
  const gradientId = "viz-line-gradient-" + chartId;
  const gridMaskId = "viz-grid-mask-" + chartId;
  const svg = svgElement("svg", { role: "img" });
  const lineMarkers = svgElement("g", { class: "viz-line-markers", "aria-hidden": "true", "pointer-events": "none" });
  tooltip.hidden = true;
  tooltip.setAttribute("role", "status");
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "group");
  scroller.setAttribute("aria-label", "Plot. Use arrow keys to explore the values.");
  scroller.append(svg);
  card.append(header, chartBody, tooltip);
  chartBody.append(scroller);
  host.replaceChildren(card);

  function isLine() {
    return config.type === "line" || config.type === "line-column";
  }

  function displayHeadline(index: number, mark: Mark | undefined, settle: boolean) {
    if (!headline || (config.type !== "line" && config.type !== "line-column")) return;
    const value = config.series[0]?.values[index];
    const text = mark && value != null && options.formatHeadline
      ? options.formatHeadline(value) : mark?.values[0]?.[1] ?? config.headline ?? "";
    const current = headline.textContent ?? "";
    if (!settle && current === text) return;
    const from = current === text ? previousHeadline : current;
    previousHeadline = settle ? text : current;
    if (!settle || reducedMotion?.matches || from === text) {
      if (current !== text) headline.textContent = text;
      return;
    }

    const previousDigits = from.match(/\p{Decimal_Number}/gu) ?? [];
    let position = previousDigits.length - (text.match(/\p{Decimal_Number}/gu)?.length ?? 0);
    headline.replaceChildren(...Array.from(text, character => {
      if (!/\p{Decimal_Number}/u.test(character) || previousDigits[position++] === character) return character;
      const slot = element("span", "viz-headline-digit");
      const digit = element("span");
      digit.textContent = character;
      slot.append(digit);
      return slot;
    }));
  }

  function display(index: number, settleHeadline = false) {
    active = index;
    const mark = layout?.marks[index];
    displayHeadline(index, mark, settleHeadline);
    const points = pinned && "series" in config && config.marker !== false ? mark?.points ?? [] : [];
    lineMarkers.replaceChildren(...points.map(point => svgElement("circle", {
      cx: mark.x, cy: point.y, r: 5, fill: point.color, stroke: "var(--viz-surface)", "stroke-width": 1,
    })));
    tooltip.hidden = !mark;
    if (!mark) return;
    const title = element("strong");
    title.textContent = mark.label;
    const rows = mark.values.map(([name, value], i) => {
      const row = element("div", "viz-tooltip-row");
      row.style.setProperty("--series-color", mark.colors[i]);
      row.textContent = name + "  " + value;
      return row;
    });
    tooltip.replaceChildren(title, ...rows);
    const cardBounds = card.getBoundingClientRect();
    const plotBounds = scroller.getBoundingClientRect();
    const scaleX = cardBounds.width / card.offsetWidth || 1;
    const scaleY = cardBounds.height / card.offsetHeight || 1;
    const offset = (plotBounds.left - cardBounds.left) / scaleX + mark.x - scroller.scrollLeft;
    tooltip.style.left = Math.max(12, Math.min(card.clientWidth - tooltip.offsetWidth - 12, offset + 12)) + "px";
    tooltip.style.top = Math.max(12, (plotBounds.top - cardBounds.top) / scaleY + mark.y - tooltip.offsetHeight - 8) + "px";
  }

  function draw() {
    const nextWidth = Math.floor(scroller.clientWidth);
    const minimumWidth = config.type === "strip" ? 1 : 96;
    if (nextWidth < minimumWidth || width === nextWidth) return;
    width = nextWidth;
    const keepLineSelection = pinned && isLine();
    pinned = keepLineSelection;
    const nextConfig = config.type === "strip" ? { ...config, selected: stripSelection } : config;
    layout = chartLayout(nextConfig, width, options);
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
      const defs = svgElement("defs", {});
      if (layout.lineFill) {
        const { path, color, top, bottom } = layout.lineFill;
        const gradient = svgElement("linearGradient", { id: gradientId, gradientUnits: "userSpaceOnUse", x1: 0, x2: 0, y1: top, y2: bottom });
        gradient.append(
          svgElement("stop", { offset: 0, "stop-color": color, "stop-opacity": "var(--viz-page-gradient-opacity, 0.4)" }),
          svgElement("stop", { offset: 1, "stop-color": color, "stop-opacity": 0 }),
        );
        defs.append(gradient);
        svg.prepend(svgElement("path", { d: path, fill: `url(#${gradientId})`, "aria-hidden": "true", "pointer-events": "none" }));
      }
      const gridLines = marks.filter(node => node.localName === "line");
      if (gridLines.length) {
        const rows = gridLines.map(node => Number(node.getAttribute("y1")));
        const bars = marks.filter(node => {
          if (node.localName !== "rect") return false;
          const y = Number(node.getAttribute("y"));
          const height = Number(node.getAttribute("height"));
          return height > 0 && rows.some(row => row + 0.5 > y && row - 0.5 < y + height);
        });
        if (bars.length || layout.lineFill) {
          const bounds = { x: 0, y: 0, width: layout.width, height: layout.height };
          const mask = svgElement("mask", { id: gridMaskId, ...bounds, maskUnits: "userSpaceOnUse" });
          mask.append(svgElement("rect", { ...bounds, fill: "white" }));
          for (const bar of bars) {
            const silhouette = bar.cloneNode() as SVGElement;
            silhouette.setAttribute("fill", "black");
            silhouette.removeAttribute("opacity");
            mask.append(silhouette);
          }
          if (layout.lineFill) mask.append(svgElement("path", { d: layout.lineFill.path, fill: "black" }));
          defs.append(mask);
          const grid = svgElement("g", { mask: `url(#${gridMaskId})` });
          gridLines[0].before(grid);
          grid.append(...gridLines);
        }
      }
      if (defs.hasChildNodes()) svg.prepend(defs);
      if (isLine()) svg.append(lineMarkers);
    }
    display(keepLineSelection ? active : -1);
  }

  function selectStrip(index: number) {
    if (config.type !== "strip" || !config.items[index] || !layout?.marks[index]) return;
    stripSelection = index;
    const items = config.items;
    svg.querySelectorAll("[data-strip-index]").forEach(segment => {
      const i = Number(segment.getAttribute("data-strip-index"));
      segment.setAttribute("fill", stripFill(items[i], i, index));
    });
    items.forEach((item, i) => {
      const fill = stripFill(item, i, index);
      layout.marks[i].colors = [fill, fill];
      stripRows[i]?.setAttribute("aria-pressed", String(i === index));
    });
    display(index);
  }

  function render() {
    const themeKeys = { accent: "accent", background: "surface", ink: "ink", muted: "muted", grid: "grid", fontFamily: "font" } as const;
    Object.entries(themeKeys).forEach(([key, token]) => {
      const value = config.theme?.[key as keyof ChartTheme];
      if (value) card.style.setProperty("--viz-" + token, value);
      else card.style.removeProperty("--viz-" + token);
    });
    card.dataset.chart = config.type;
    const headingCopy = element("div", "viz-heading-copy");
    const title = element("h2");
    title.textContent = config.title;
    headingCopy.append(title);
    headline = undefined;
    previousHeadline = config.headline ?? "";
    if (config.headline) {
      headline = element("p", "viz-headline");
      headline.textContent = config.headline;
      headingCopy.append(headline);
    }
    header.replaceChildren(headingCopy);
    if (options.controls) {
      header.append(options.controls);
    } else if (config.period) {
      const period = element("span", "viz-period");
      period.textContent = config.period;
      header.append(period);
    }
    chartBody.querySelector(".viz-legend")?.remove();
    delete chartBody.dataset.legendPosition;
    stripRows = [];
    if (config.type === "strip" && config.legend !== false) {
      chartBody.dataset.legendPosition = config.legendPosition ?? "right";
      const legend = element("div", "viz-legend");
      const total = stripTotal(config.items);
      const formatValue = options.formatValue ?? format;
      stripRows = config.items.map((item, i) => {
        const button = element("button");
        const name = element("span");
        const value = element("span");
        const share = element("span");
        button.type = "button";
        button.setAttribute("aria-pressed", String(i === stripSelection));
        button.style.setProperty("--strip-color", item.color ?? color);
        name.textContent = item.label;
        value.textContent = formatValue(item.value);
        share.textContent = formatValue(stripShare(item.value, total), shareFormat);
        button.append(name, value, share);
        button.addEventListener("focus", () => display(i));
        button.addEventListener("blur", () => display(-1));
        button.addEventListener("click", () => selectStrip(i));
        return button;
      });
      legend.append(...stripRows);
      chartBody.append(legend);
    } else if ("series" in config && config.series.length > 1 && config.type !== "line-column") {
      const legend = element("div", "viz-series");
      config.series.forEach((series, i) => {
        const item = element("span");
        item.style.setProperty("--series-color", series.color ?? (i ? secondaryColor : color));
        item.textContent = series.name;
        legend.append(item);
      });
      header.append(legend);
    }
    width = -1;
    draw();
  }
  function closest(event: PointerEvent) {
    if (!layout) return -1;
    if (config.type === "strip") {
      const segment = (event.target as Element).closest("[data-strip-index]");
      return segment ? Number(segment.getAttribute("data-strip-index")) : -1;
    }
    const bounds = svg.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * layout.width / (bounds.width || layout.width);
    const y = (event.clientY - bounds.top) * layout.height / (bounds.height || layout.height);
    let closest = -1;
    let distance = Infinity;
    layout.marks.forEach((mark, i) => {
      if (mark.points?.length === 0) return;
      const d = Math.abs(mark.x - x) + (config.type === "heatmap" ? Math.abs(mark.y - y) : 0);
      if (d < distance) { closest = i; distance = d; }
    });
    return closest;
  }
  svg.addEventListener("pointerdown", event => {
    if (!isLine() || !event.isPrimary || event.button !== 0) return;
    const index = closest(event);
    if (index < 0) return;
    linePointer = event.pointerId;
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener("pointermove", event => {
    const dragging = linePointer === event.pointerId;
    if (!dragging && (pinned || event.pointerType === "touch")) return;
    const index = closest(event);
    if (isLine() && index === active && (!dragging || pinned)) return;
    if (dragging) pinned = true;
    display(index);
  });
  svg.addEventListener("pointerup", event => {
    if (!event.isPrimary || event.button !== 0) return;
    const index = closest(event);
    if (config.type === "strip") selectStrip(index);
    else if (index >= 0) {
      pinned = true;
      display(index, true);
    }
  });
  svg.addEventListener("lostpointercapture", () => { linePointer = null; });
  svg.addEventListener("pointerleave", () => {
    if (!pinned) display(-1, true);
  });
  scroller.addEventListener("blur", () => {
    if (pinned && isLine()) return;
    pinned = false;
    display(-1);
  });
  scroller.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      pinned = false;
      display(-1, true);
      return;
    }
    if (!layout?.marks.length) return;
    if (config.type === "strip" && active >= 0 && [" ", "Enter"].includes(event.key)) {
      event.preventDefault();
      selectStrip(active);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const indexes = layout.marks.flatMap((mark, i) => mark.points?.length === 0 ? [] : [i]);
    const last = indexes.length - 1;
    if (last < 0) return;
    const position = event.key === "Home" ? 0 : event.key === "End" ? last
      : Math.max(0, Math.min(last, indexes.indexOf(active) + (event.key === "ArrowLeft" ? -1 : 1)));
    const index = indexes[position];
    const x = layout.marks[index].x;
    if (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = x - scroller.clientWidth / 2;
    if (isLine()) pinned = true;
    display(index);
  });
  const observer = new ResizeObserver(draw);
  render();
  observer.observe(scroller);
  return {
    update(next: ChartConfig) {
      if (next.type === "strip") {
        const previous = config.type === "strip" ? config : undefined;
        const defaultItem = next.items[next.selected ?? -1];
        const selectedItem = previous?.items[stripSelection];
        const previousDefault = previous?.items[previous.selected ?? -1];
        const movedIndex = selectedItem && defaultItem === previousDefault ? next.items.indexOf(selectedItem) : -1;
        stripSelection = movedIndex >= 0 ? movedIndex : next.selected ?? -1;
      }
      if (pinned && "series" in config && "series" in next) {
        pinned = next.type === config.type && next.labels[active] === config.labels[active]
          && next.series.length === config.series.length
          && config.series.every((series, i) => next.series[i].values[active] === series.values[active]);
      } else {
        pinned = false;
      }
      config = next;
      render();
    },
    getData() {
      const data = layout ?? chartLayout(config, 320, options);
      return data.marks.flatMap(mark => mark.values.map(([series, value]) => ({ label: mark.label, series, value })));
    },
    destroy() { observer.disconnect(); card.remove(); },
  };
}
