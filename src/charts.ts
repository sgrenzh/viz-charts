import { scaleBand, scaleLinear } from "d3-scale";
import { arc, area, line } from "d3-shape";
import { animateHorizon, captureHorizon } from "./horizon-transition.js";

export type ChartConfig = CartesianConfig | RangeColumnConfig | HeatmapConfig | StripConfig | DonutConfig;
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
  performance?: number;
  showPerformance?: boolean;
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
  axisLabels?: string[];
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
export interface RangeColumnConfig extends BaseConfig {
  type: "range-column";
  labels: string[];
  axisLabels?: string[];
  ranges: ({ low: number; high: number } | null)[];
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  grid?: boolean;
  showTracks?: boolean;
  plotWidthFactor?: number;
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
  segmented?: boolean;
  capacity?: number;
  segmentCount?: number;
}

export interface DonutConfig extends BaseConfig {
  type: "donut";
  items: { label: string; value: number; color?: string }[];
  selected?: number;
  legend?: boolean;
  legendPosition?: LegendPosition;
  showCenter?: boolean;
  ringWidth?: number;
  gap?: number;
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
  donutRingWidth?: () => number;
  demoState?: "loading" | "error";
  loadingStyle?: "skeleton" | "spinner";
}

let nextChartId = 0;

const color = "var(--viz-accent)";
const muted = "var(--viz-muted)";
const rules = "var(--viz-grid)";
const axisLabelSize = 12;
const dayMs = 86_400_000;
const subtleRadius = (width: number, requested: number) => Math.min(requested, Math.max(0, width) * 0.16);
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
  // Consecutive identical labels describe a group; anchor its label at the group's centre.
  const candidates = labels.flatMap((text, index) => {
    if (!text || text === labels[index - 1]) return [];
    let last = index;
    while (last + 1 < labels.length && labels[last + 1] === text) last++;
    const x = (center(index) + center(last)) / 2;
    const textWidth = estimateAxisLabelWidth(text);
    const anchor = x - textWidth / 2 < 0 ? "start" : x + textWidth / 2 > width ? "end" : "middle";
    const start = anchor === "start" ? x : anchor === "end" ? x - textWidth : x - textWidth / 2;
    return [{ text, x, anchor, start, end: start + textWidth }];
  });
  const firstStep = Math.max(1, Math.ceil(candidates.length / Math.max(1, maxTicks)));
  for (let step = firstStep; step <= candidates.length; step++) {
    const ticks: Shape[] = [];
    let previousEnd = -Infinity;
    let fits = true;
    for (let i = 0; i < candidates.length; i += step) {
      const { text, x, anchor, start, end } = candidates[i];
      if (start < 0 || end > width || start < previousEnd + 8) { fits = false; break; }
      const tick = label(x, y, text, anchor);
      tick.attrs["dominant-baseline"] = "text-after-edge";
      ticks.push(tick);
      previousEnd = end;
    }
    if (fits) return ticks;
  }
  return [];
}

function cartesian(config: CartesianConfig, width: number, formatValue: typeof format): Layout {
  const height = config.height ?? 272;
  const showX = config.xAxis?.show !== false;
  const showY = config.yAxis?.show !== false;
  const left = 0;
  const top = 12;
  const bottom = height - (showX ? (config.xAxis?.label ? 36 : 20) : showY ? 12 : 0);
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
  if (showX) shapes.push(...xAxisLabels(config.axisLabels ?? config.labels, config.xAxis?.ticks ?? 12, right, height - (config.xAxis?.label ? 16 : 0), center));
  if (showX && config.xAxis?.label) shapes.push(shape("text", { ...label((left + right) / 2, height, config.xAxis.label, "middle").attrs, "dominant-baseline": "text-after-edge" }, config.xAxis.label));
  if (showY && axisTitle) shapes.push(label(right + labelGap, top, axisTitle));

  const getColor = (series: Series, i: number) => series.color ?? (combo && i === 1 ? "var(--viz-volume, #C8C7CB)" : i ? secondaryColor : color);
  let lineFill: LineFill | undefined;
  if (column) {
    const start = indexes.map(() => ({ pos: 0, neg: 0 }));
    main.forEach((series, s) => {
      const groups = stack ? 1 : main.length;
      const responsiveWidth = stack ? Math.max(config.barWidth ?? 4, Math.min(12, width / 110)) : config.barWidth ?? (indexes.length === 1 ? Math.min(64, width / 7) : Infinity);
      const w = Math.min(responsiveWidth, band.bandwidth() / groups);
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
        shapes.push(shape("rect", { x, y: barY, width: w, height: barHeight, rx: stack ? 0 : subtleRadius(w, config.barRadius ?? 2), fill, "data-bar-index": i, ...(stack ? { "data-stack-index": i } : {}), opacity: config.barStyle === "cap" ? "var(--viz-page-cap-opacity, 0.12)" : 1 }));
        if (config.barStyle === "cap" && barHeight) {
          const cap = Math.min(2, barHeight);
          const r = Math.min(cap, subtleRadius(w, cap));
          const edge = v >= 0 ? barY : barY + barHeight;
          const inside = edge + (v >= 0 ? cap : -cap);
          const d = `M${x},${inside} Q${x},${edge} ${x + r},${edge} H${x + w - r} Q${x + w},${edge} ${x + w},${inside} Z`;
          shapes.push(shape("path", { d, fill, "data-bar-index": i, "data-bar-cap": "", ...(stack ? { "data-stack-index": i } : {}) }));
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
        shapes.push(shape("rect", { x: center(i) - w / 2, y: volumeY(v), width: w, height: bottom - volumeY(v), rx: subtleRadius(w, 2), fill: getColor(volume, 1), "data-bar-index": i }));
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
    shapes.push(shape("rect", { x, y, width: size, height: size, rx: config.radius ?? 4, fill, ...(value !== undefined ? { "data-heat-index": marks.length } : {}) }));
    const current = date.toLocaleDateString("en", { month: "short", timeZone: "UTC" });
    if (current !== month && (i % 7 === 0 || i === 0)) {
      shapes.push(label(x, stride * 7 + 36, current));
      month = current;
    }
    if (value !== undefined) marks.push({
      x: x + size / 2, y: y + size / 2, label: date.toISOString().slice(0, 10),
      values: [[config.title, formatValue(value)]], colors: [fill],
    });
  }
  const gridWidth = count ? Math.ceil(count / 7) * stride - gap : 0;
  return { width: Math.max(available, gridWidth), height: stride * 7 + 48, shapes, marks };
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

function segmentFill(item: StripConfig["items"][number], index: number) {
  return item.color ?? (index % 3 === 0 ? color : tint(index % 3 === 1 ? "75%" : "52%", color));
}

const shareFormat: AxisConfig = { format: "percent", digits: 1 };

function strip(config: StripConfig, width: number, formatValue: typeof format): Layout {
  if (config.segmented) {
    const height = config.height ?? 40;
    const total = stripTotal(config.items);
    const capacity = Math.max(config.capacity ?? total, total, Number.EPSILON);
    const targetCount = Math.max(1, Math.min(config.segmentCount ?? 120, Math.floor(width / 3)));
    const originalStep = width / targetCount;
    const originalGap = Math.min(2, originalStep * 0.25);
    let barWidth = Math.min(width, originalStep - originalGap + 2);
    const desiredGap = originalGap + 4;
    const count = Math.max(1, Math.min(targetCount, Math.floor((width + desiredGap) / (barWidth + desiredGap))));
    if (count === 1) barWidth = width;
    const gap = count > 1 ? (width - count * barWidth) / (count - 1) : 0;
    const step = barWidth + gap;
    const boundaries: number[] = [];
    config.items.reduce((sum, item) => { boundaries.push(sum + Math.max(0, item.value)); return boundaries[boundaries.length - 1]; }, 0);
    const shapes: Shape[] = [];
    for (let n = 0; n < count; n++) {
      const at = (n + 0.5) / count * capacity;
      const index = boundaries.findIndex(end => at < end);
      shapes.push(shape("rect", { x: n * step, y: 0, width: barWidth, height, rx: Math.min(2, barWidth / 2, height / 2),
        fill: index < 0 ? "var(--viz-grid)" : segmentFill(config.items[index], index),
        ...(index >= 0 ? { class: "viz-strip-segment", "data-strip-index": index } : {}) }));
      // A transparent full-step hit box includes the visual gap between segments.
      if (index >= 0) shapes.push(shape("rect", { x: Math.max(0, n * step - gap / 2), y: 0,
        width: Math.min(width - Math.max(0, n * step - gap / 2), step), height, fill: "transparent",
        class: "viz-strip-hit", "data-strip-index": index }));
    }
    let start = 0;
    const marks = config.items.map((item, i) => {
      const end = boundaries[i];
      const mark = { label: item.label, x: barWidth / 2 + (start + end) / 2 / capacity * Math.max(0, (count - 1) * step), y: height / 2,
        values: [["Reservations", formatValue(item.value)], ["Share of capacity", formatValue(stripShare(item.value, capacity), shareFormat)]] as [string, string][],
        colors: [segmentFill(item, i), segmentFill(item, i)] };
      start = end;
      return mark;
    });
    return { width, height, shapes, marks };
  }
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

function rangeColumn(config: RangeColumnConfig, width: number, formatValue: typeof format): Layout {
  width = Math.ceil(width * Math.max(1, config.plotWidthFactor ?? 1));
  const height = config.height ?? 272;
  const showX = config.xAxis?.show !== false;
  const showY = config.yAxis?.show !== false;
  const top = 12;
  const bottom = height - (showX ? (config.xAxis?.label ? 36 : 20) : showY ? 12 : 0);
  const values = config.ranges.flatMap(range => range ? [range.low, range.high] : []);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const min = config.yAxis?.min ?? low;
  const max = config.yAxis?.max ?? Math.max(high, min + Math.max(1, Math.abs(min)) * 1e-6);
  const y = scaleLinear([min, max], [bottom, top]).clamp(true);
  if (config.yAxis?.min === undefined && config.yAxis?.max === undefined) y.nice(config.yAxis?.ticks ?? 4);
  const ticks = y.ticks(config.yAxis?.ticks ?? 4);
  const labels = ticks.map(value => formatValue(value, config.yAxis));
  const padding = showY ? Math.max(width < 420 ? 48 : 72, ...labels.map(text => estimateAxisLabelWidth(text) + 10)) : 0;
  const right = Math.max(1, width - padding);
  const band = scaleBand(config.labels.map((_, i) => String(i)), [0, right]);
  const center = (i: number) => (band(String(i)) ?? 0) + band.bandwidth() / 2;
  const shapes: Shape[] = [];
  ticks.forEach((value, i) => {
    if (config.grid !== false) shapes.push(shape("line", { x1: 0, y1: y(value), x2: right, y2: y(value), stroke: rules }));
    if (showY) shapes.push(label(right + 8, y(value) + 4, labels[i]));
  });
  if (showX) shapes.push(...xAxisLabels(config.axisLabels ?? config.labels, config.xAxis?.ticks ?? 12, right, height - (config.xAxis?.label ? 16 : 0), center));
  if (showX && config.xAxis?.label) shapes.push(shape("text", { ...label(right / 2, height, config.xAxis.label, "middle").attrs, "dominant-baseline": "text-after-edge" }, config.xAxis.label));
  if (showY && config.yAxis?.label) shapes.push(label(right + 8, top, config.yAxis.label));
  const marks = config.labels.map((name, i): Mark => {
    const range = config.ranges[i];
    const x = center(i);
    if (config.showTracks !== false) shapes.push(shape("rect", { x: x - 1, y: top, width: 2, height: bottom - top, rx: subtleRadius(2, 2), fill: rules }));
    if (range) {
      const lineWidth = Math.min(3, band.bandwidth() * 0.7);
      shapes.push(shape("rect", { x: x - lineWidth / 2, y: y(range.high), width: lineWidth, height: Math.max(1, y(range.low) - y(range.high)), rx: subtleRadius(lineWidth, 2), fill: color, "data-bar-index": i }));
    }
    return { label: name, x, y: range ? y(range.high) : top, values: range ? [["Low", formatValue(range.low, config.yAxis)], ["High", formatValue(range.high, config.yAxis)]] : [], colors: [color, color], points: range ? undefined : [] };
  });
  return { width, height, shapes, marks };
}

function donutColor(item: DonutConfig["items"][number], index: number, lead = color) {
  return item.color ?? (index === 0 ? lead : `color-mix(in srgb, ${lead} ${Math.max(24, 92 - index * 20)}%, var(--viz-surface))`);
}

function donut(config: DonutConfig, width: number, formatValue: typeof format, defaultRingWidth = 4): Layout {
  const height = config.height ?? 232;
  const diameter = Math.max(0, Math.min(width, height) * 0.86);
  const outer = diameter / 2;
  const thickness = Math.min(outer, Math.max(0.01, config.ringWidth === undefined ? defaultRingWidth : diameter * config.ringWidth));
  const radius = outer - thickness / 2;
  const cx = width / 2, cy = height / 2;
  const total = stripTotal(config.items);
  const visibleCount = config.items.filter(item => item.value > 0).length;
  const gapAngle = visibleCount > 1 && radius ? Math.min((config.gap ?? 4) / radius, Math.PI / visibleCount) : 0;
  const shapeArc = arc().innerRadius(Math.max(0, outer - thickness)).outerRadius(outer)
    .cornerRadius(Math.min(thickness / 2, Math.max(0.5, diameter * 0.025))).padRadius(radius);
  const hitArc = arc().innerRadius(Math.max(0, outer - thickness - 9)).outerRadius(outer + 9).padRadius(radius);
  const hits: Shape[] = [];
  const shapes: Shape[] = [];
  const marks: Mark[] = [];
  let angle = 0;
  config.items.forEach((item, i) => {
    const share = stripShare(item.value, total);
    const next = angle + share * Math.PI * 2;
    const fill = donutColor(item, i, config.items[0]?.color ?? color);
    const middle = (angle + next) / 2;
    if (share > 0) {
      const d = shapeArc({ innerRadius: Math.max(0, outer - thickness), outerRadius: outer, startAngle: angle, endAngle: next, padAngle: Math.min(gapAngle, (next - angle) * 0.8) });
      if (d) shapes.push(shape("path", { d, transform: `translate(${cx} ${cy})`, style: `--donut-lead:${config.items[0]?.color ?? color}`, fill, class: "viz-donut-segment", "data-donut-segment-index": i, "data-selected": String(i === (config.selected ?? 0)) }));
      const hit = hitArc({ innerRadius: Math.max(0, outer - thickness - 9), outerRadius: outer + 9, startAngle: angle, endAngle: next, padAngle: Math.min(gapAngle, (next - angle) * 0.8) });
      if (hit) hits.push(shape("path", { d: hit, transform: `translate(${cx} ${cy})`, fill: "transparent", "data-donut-index": i, class: "viz-donut-hit" }));
    }
    marks.push({ x: cx + radius * Math.sin(middle), y: cy - radius * Math.cos(middle), label: item.label,
      values: [["Value", formatValue(item.value)], ["Share", formatValue(share, shareFormat)]], colors: [fill, fill] });
    angle = next;
  });
  shapes.push(...hits);
  const selected = config.items[config.selected ?? 0];
  if (config.showCenter !== false && selected) {
    shapes.push(shape("text", { x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "central", class: "viz-donut-value", fill: "var(--viz-ink)" }, formatValue(stripShare(selected.value, total), shareFormat)));
  }
  return { width, height, shapes, marks };
}

export function chartLayout(config: ChartConfig, width: number, options: ChartOptions = {}): Layout {
  const formatValue = options.formatValue ?? format;
  if (config.type === "heatmap") return heatmap(config, width, formatValue);
  if (config.type === "strip") return strip(config, width, formatValue);
  if (config.type === "donut") return donut(config, width, formatValue, options.donutRingWidth?.());
  if (config.type === "range-column") return rangeColumn(config, width, formatValue);
  return cartesian(config, width, formatValue);
}

export function mountChart(host: HTMLElement, initial: ChartConfig, options: ChartOptions = {}) {
  let config = initial;
  let width = -1;
  let active = -1;
  let pinned = false;
  let touchTooltipIndex = -1;
  let linePointer: number | null = null;
  let retryTimer: number | undefined;
  let retrying = false;
  let headline: HTMLParagraphElement | undefined;
  let previousHeadline = "";
  let headlineAnimation = 0;
  let stopHorizonAnimation: (() => void) | undefined;
  const reducedMotion = host.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
  let stripSelection = initial.type === "strip" || initial.type === "donut" ? initial.selected ?? (initial.type === "donut" ? 0 : -1) : -1;
  let layout: Layout;
  let stripRows: HTMLButtonElement[] = [];
  const card = element("section", "viz-card");
  const header = element("header", "viz-heading");
  const chartBody = element("div", "viz-body");
  const scroller = element("div", "viz-plot");
  const tooltip = element("div", "viz-tooltip");
  const stateAnnouncement = element("span", "viz-sr-only");
  stateAnnouncement.setAttribute("role", "status");
  stateAnnouncement.setAttribute("aria-atomic", "true");
  const chartId = ++nextChartId;
  const clipId = "viz-strip-clip-" + chartId;
  const gradientId = "viz-line-gradient-" + chartId;
  const gridMaskId = "viz-grid-mask-" + chartId;
  const svg = svgElement("svg", { role: "img" });
  const lineMarkers = svgElement("g", { class: "viz-line-markers", "aria-hidden": "true", "pointer-events": "none" });
  tooltip.hidden = true;
  tooltip.id = `viz-tooltip-${chartId}`;
  tooltip.setAttribute("role", "status");
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "group");
  scroller.setAttribute("aria-label", "Plot. Use arrow keys to explore the values.");
  scroller.append(svg);
  card.append(header, chartBody, tooltip, stateAnnouncement);
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
    animateHeadline(headline, text, settle);
  }

  function animateHeadline(target: HTMLElement, text: string, settle: boolean) {
    const current = target.getAttribute("aria-label") ?? target.textContent ?? "";
    if (!settle && current === text) return;
    const from = current === text ? previousHeadline : current;
    previousHeadline = settle ? text : current;
    headlineAnimation++;
    target.setAttribute("aria-label", text);
    if (reducedMotion?.matches || from === text) {
      if (current !== text || target.childElementCount) target.textContent = text;
      return;
    }

    const previousDigits = from.match(/\p{Decimal_Number}/gu) ?? [];
    const digitCount = text.match(/\p{Decimal_Number}/gu)?.length ?? 0;
    let position = previousDigits.length - digitCount;
    let digitIndex = 0;
    target.replaceChildren(...Array.from(text, character => {
      if (!/\p{Decimal_Number}/u.test(character)) return character;
      const order = digitIndex++;
      if (previousDigits[position++] === character) return character;
      const slot = element("span", "viz-headline-digit");
      const digit = element("span", "viz-headline-reel");
      digit.setAttribute("aria-hidden", "true");
      digit.style.setProperty("--reel-duration", settle ? "520ms" : "120ms");
      digit.style.setProperty("--reel-delay", settle ? `${order * 45}ms` : "0ms");
      const old = element("span"); old.textContent = previousDigits[position - 1] ?? character;
      const next = element("span"); next.textContent = character;
      digit.append(old, next);
      slot.append(digit);
      return slot;
    }));
    const animation = headlineAnimation;
    window.setTimeout(() => { if (target.isConnected && animation === headlineAnimation) target.textContent = text; }, settle ? 540 + Math.max(0, digitCount - 1) * 45 : 140);
  }

  function display(index: number, settleHeadline = false, pointer?: PointerEvent, anchor?: HTMLElement) {
    active = index;
    const mark = layout?.marks[index];
    if (config.type === "column" || config.type === "line-column" || config.type === "range-column") {
      const barConfig = config;
      svg.querySelectorAll<SVGElement>("[data-bar-index]").forEach(bar => {
        if (bar.closest("defs")) return;
        const selected = Number(bar.getAttribute("data-bar-index")) === index;
        const cappedBody = barConfig.type === "column" && barConfig.barStyle === "cap" && !bar.hasAttribute("data-bar-cap");
        bar.style.opacity = mark && !selected
          ? cappedBody ? "calc(var(--viz-page-cap-opacity, 0.12) * 0.22)" : "0.22"
          : mark && selected && cappedBody ? "1" : "";
      });
    }
    if (config.type === "heatmap") svg.querySelectorAll<SVGElement>("[data-heat-index]").forEach(cell => {
      cell.style.opacity = mark && Number(cell.getAttribute("data-heat-index")) !== index ? "0.3" : "";
    });
    displayHeadline(index, mark, settleHeadline);
    const points = isLine() && "series" in config && config.marker !== false ? mark?.points ?? [] : [];
    const guide = isLine() && "xAxis" in config && config.xAxis?.show !== false && points.length && mark
      ? [svgElement("line", { x1: mark.x, x2: mark.x, y1: 12, y2: layout.height - ("xAxis" in config && config.xAxis?.label ? 36 : 20) - (config.type === "line-column" && config.showVolume !== false ? 44 : 0),
        stroke: "var(--viz-muted)", "stroke-width": 1, "stroke-dasharray": "4 4" })]
      : [];
    lineMarkers.replaceChildren(...guide, ...points.map(point => svgElement("circle", {
      cx: mark.x, cy: point.y, r: 5, fill: point.color, stroke: "var(--viz-surface)", "stroke-width": 1,
    })));
    const wasHidden = tooltip.hidden;
    tooltip.hidden = !mark;
    if (mark) scroller.setAttribute("aria-describedby", tooltip.id);
    else scroller.removeAttribute("aria-describedby");
    if (!mark) return;
    if (wasHidden) tooltip.classList.add("viz-tooltip-instant");
    const title = element("strong");
    title.textContent = mark.label;
    const segmented = config.type === "strip" && !!config.segmented;
    tooltip.classList.toggle("viz-tooltip-segmented", segmented);
    if (segmented) title.style.setProperty("--series-color", mark.colors[0]);
    const rows = mark.values.map(([name, value], i) => {
      const row = element("div", "viz-tooltip-row");
      row.style.setProperty("--series-color", mark.colors[i]);
      const label = element("span", "viz-tooltip-label");
      const amount = element("span", "viz-tooltip-value");
      label.textContent = name;
      amount.textContent = value;
      row.append(label, amount);
      return row;
    });
    tooltip.replaceChildren(title, ...rows);
    const cardBounds = card.getBoundingClientRect();
    const plotBounds = scroller.getBoundingClientRect();
    const scaleX = cardBounds.width / card.offsetWidth || 1;
    const scaleY = cardBounds.height / card.offsetHeight || 1;
    const svgBounds = svg.getBoundingClientRect();
    const pointX = pointer ? (pointer.clientX - svgBounds.left) * layout.width / (svgBounds.width || layout.width) : mark.x;
    const pointY = pointer ? (pointer.clientY - svgBounds.top) * layout.height / (svgBounds.height || layout.height) : mark.y;
    const anchorBounds = anchor?.getBoundingClientRect();
    const offset = anchorBounds ? (anchorBounds.left - cardBounds.left) / scaleX + anchorBounds.width / scaleX / 2 : (plotBounds.left - cardBounds.left) / scaleX + pointX - scroller.scrollLeft;
    tooltip.style.left = Math.max(12, Math.min(card.clientWidth - tooltip.offsetWidth - 12, offset + 12)) + "px";
    tooltip.style.top = Math.max(12, (anchorBounds ? (anchorBounds.top - cardBounds.top) / scaleY : (plotBounds.top - cardBounds.top) / scaleY + pointY) - tooltip.offsetHeight - 8) + "px";
    if (wasHidden) { void tooltip.offsetWidth; tooltip.classList.remove("viz-tooltip-instant"); }
  }

  function draw() {
    if (options.demoState) return;
    const nextWidth = Math.floor(scroller.clientWidth);
    const minimumWidth = config.type === "strip" ? 1 : 96;
    if (nextWidth < minimumWidth || width === nextWidth) return;
    width = nextWidth;
    const keepLineSelection = pinned && isLine();
    pinned = keepLineSelection;
    const nextConfig = config.type === "strip" || config.type === "donut" ? { ...config, selected: stripSelection } : config;
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
    if (config.type === "donut") {
      const centerIndex = marks.findIndex(node => node.classList.contains("viz-donut-value"));
      if (centerIndex >= 0) {
        const initial = marks[centerIndex].textContent ?? "";
        const foreign = svgElement("foreignObject", { x: 0, y: layout.height / 2 - 20, width: layout.width, height: 40, "pointer-events": "none" });
        const center = element("div", "viz-donut-center"); center.textContent = initial; center.setAttribute("aria-label", initial); foreign.append(center); marks[centerIndex] = foreign;
      }
    }
    if (layout.clip) {
      const clip = svgElement("clipPath", { id: clipId });
      clip.append(svgElement("rect", layout.clip));
      const group = svgElement("g", { "clip-path": `url(#${clipId})` });
      group.append(...marks);
      svg.replaceChildren(clip, group);
    } else {
      svg.replaceChildren(...marks);
      const defs = svgElement("defs", {});
      if (config.type === "column" && config.stacked && (config.barRadius ?? 2) > 0) {
        for (let i = 0; i < config.labels.length; i++) {
          const segments = marks.filter(node => node.getAttribute("data-stack-index") === String(i));
          const bars = segments.filter(node => node.localName === "rect" && Number(node.getAttribute("height")) > 0);
          if (!bars.length) continue;
          const top = Math.min(...bars.map(bar => Number(bar.getAttribute("y"))));
          const bottom = Math.max(...bars.map(bar => Number(bar.getAttribute("y")) + Number(bar.getAttribute("height"))));
          const id = `viz-stack-clip-${chartId}-${i}`;
          const clip = svgElement("clipPath", { id, clipPathUnits: "userSpaceOnUse" });
          clip.append(svgElement("rect", { x: bars[0].getAttribute("x")!, y: top, width: bars[0].getAttribute("width")!, height: bottom - top, rx: subtleRadius(Number(bars[0].getAttribute("width")), config.barRadius ?? 2) }));
          defs.append(clip);
          segments.forEach(segment => segment.setAttribute("clip-path", `url(#${id})`));
        }
      }
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
    if ((config.type !== "strip" && config.type !== "donut") || !config.items[index] || !layout?.marks[index]) return;
    stripSelection = index;
    const items = config.items;
    if (config.type === "donut") {
      svg.querySelectorAll<SVGElement>("[data-donut-segment-index]").forEach(segment => {
        segment.setAttribute("data-selected", String(Number(segment.getAttribute("data-donut-segment-index")) === index));
      });
      const center = svg.querySelector<HTMLElement>(".viz-donut-center");
      if (center) {
        const total = stripTotal(items);
        const value = (options.formatValue ?? format)(stripShare(items[index].value, total), shareFormat);
        animateHeadline(center, value, true);
      }
      stripRows.forEach((row, i) => row.setAttribute("aria-pressed", String(i === index)));
      display(index);
      return;
    }
    svg.querySelectorAll("[data-strip-index]").forEach(segment => {
      const i = Number(segment.getAttribute("data-strip-index"));
      segment.setAttribute("fill", stripFill(items[i], i, index));
    });
    items.forEach((item, i) => {
      const fill = stripFill(item, i, index);
      layout.marks[i].colors = [fill, fill];
      stripRows[i]?.setAttribute("aria-pressed", String(i === index));
      stripRows[i]?.style.setProperty("--strip-dot", fill);
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
    card.toggleAttribute("data-segmented", config.type === "strip" && !!config.segmented);
    if (options.demoState) {
      const visualState = retrying ? "loading" : options.demoState;
      card.dataset.state = visualState;
      stateAnnouncement.textContent = visualState === "loading" ? "Loading chart" : "Couldn’t load chart";
      card.dataset.loadingStyle = retrying ? "skeleton" : options.loadingStyle ?? "skeleton";
      const headingCopy = element("div", "viz-heading-copy");
      const title = element("h2");
      title.textContent = "Monthly activity";
      headingCopy.append(title);
      card.toggleAttribute("data-retrying", retrying);
      header.replaceChildren(headingCopy);
      const state = element("div", "viz-state-body");
      if (visualState === "loading") {
        state.setAttribute("aria-hidden", "true");
        if (retrying) {
          state.classList.add("viz-retry-wipe");
          const message = element("p", "viz-error-message"); message.textContent = "Couldn’t load chart";
          const retry = element("button", "viz-button viz-button-small viz-button-error"); retry.type = "button"; retry.textContent = "Retry"; retry.disabled = true; retry.tabIndex = -1;
          state.append(message, retry);
        } else {
          const indicator = element("div", "viz-loading-indicator");
          const spinner = element("span", "viz-loading-spinner");
          const label = element("span", "viz-loading-label"); label.textContent = "Loading...";
          indicator.append(spinner, label); state.append(indicator);
        }
      } else {
        const message = element("p", "viz-error-message"); message.textContent = "Couldn’t load chart";
        const retry = element("button", "viz-button viz-button-small viz-button-error"); retry.type = "button"; retry.textContent = "Retry";
        retry.addEventListener("click", event => {
          event.stopPropagation();
          retrying = true;
          render();
          retryTimer = window.setTimeout(() => { retrying = false; retryTimer = undefined; if (card.isConnected) render(); }, 5200);
        });
        state.append(message, retry);
      }
      chartBody.replaceChildren(state);
      tooltip.hidden = true;
      return;
    }
    delete card.dataset.state;
    const headingCopy = element("div", "viz-heading-copy");
    const title = element("h2");
    title.textContent = config.title;
    headingCopy.append(title);
    headline = undefined;
    previousHeadline = config.headline ?? "";
    if (config.headline) {
      const metric = element("div", "viz-metric");
      headline = element("p", "viz-headline");
      headline.textContent = config.headline;
      metric.append(headline);
      if (config.showPerformance !== false && config.performance !== undefined && Number.isFinite(config.performance)) {
        const pill = element("span", "viz-performance");
        pill.dataset.direction = config.performance < 0 ? "negative" : "positive";
        pill.textContent = `${config.performance > 0 ? "+" : ""}${config.performance.toFixed(1)}%`;
        pill.setAttribute("aria-label", `Change: ${pill.textContent}`);
        metric.append(pill);
      }
      headingCopy.append(metric);
    }
    header.replaceChildren(headingCopy);
    if (config.type === "strip" && config.segmented) {
      const summary = element("span", "viz-capacity-summary");
      const current = stripTotal(config.items);
      const capacity = Math.max(config.capacity ?? current, current);
      const compact: AxisConfig = { format: "compact" };
      const currentValue = element("span", "viz-capacity-current");
      const capacityValue = element("span", "viz-capacity-total");
      currentValue.textContent = (options.formatValue ?? format)(current, compact);
      capacityValue.textContent = ` of ${(options.formatValue ?? format)(capacity, compact)}`;
      summary.append(currentValue, capacityValue);
      header.append(summary);
    } else if (options.controls) {
      header.append(options.controls);
    } else if (config.period) {
      const period = element("span", "viz-period");
      period.textContent = config.period;
      header.append(period);
    }
    chartBody.querySelector(".viz-legend")?.remove();
    delete chartBody.dataset.legendPosition;
    stripRows = [];
    if ((config.type === "strip" || config.type === "donut") && config.legend !== false) {
      chartBody.dataset.legendPosition = config.type === "strip" && config.segmented ? "below" : config.legendPosition ?? "right";
      const legend = element("div", "viz-legend");
      const total = stripTotal(config.items);
      const formatValue = options.formatValue ?? format;
      stripRows = config.items.map((item, i) => {
        const button = element("button");
        const name = element("span");
        const value = element("span");
        const share = element("span");
        button.type = "button";
        const segmented = config.type === "strip" && !!config.segmented;
        if (!segmented) button.setAttribute("aria-pressed", String(i === stripSelection));
        const itemColor = config.type === "donut" ? donutColor(item, i, config.items[0]?.color ?? color) : segmented ? segmentFill(item, i) : stripFill(item, i, stripSelection);
        button.style.setProperty("--strip-color", itemColor);
        button.style.setProperty("--strip-dot", itemColor);
        name.textContent = item.label;
        value.textContent = formatValue(item.value);
        share.textContent = formatValue(stripShare(item.value, total), shareFormat);
        button.append(name, value);
        if (config.type !== "strip" || !config.segmented) button.append(share);
        let lastPointerType = "";
        if (segmented) {
          button.addEventListener("pointerdown", event => { lastPointerType = event.pointerType; });
          button.addEventListener("pointerenter", event => { if (event.pointerType !== "touch" && touchTooltipIndex < 0) display(i, false, undefined, button); });
          button.addEventListener("pointerleave", event => { if (event.pointerType !== "touch" && touchTooltipIndex < 0 && !button.matches(":focus-visible")) display(-1); });
        }
        button.addEventListener("focus", () => { if (!segmented || lastPointerType !== "touch") display(i, false, undefined, segmented ? button : undefined); });
        button.addEventListener("blur", () => { touchTooltipIndex = -1; display(-1); });
        button.addEventListener("click", () => {
          if (!segmented) { selectStrip(i); return; }
          if (lastPointerType === "touch") {
            touchTooltipIndex = touchTooltipIndex === i ? -1 : i;
            display(touchTooltipIndex, false, undefined, button);
          } else { touchTooltipIndex = -1; display(i, false, undefined, button); }
          lastPointerType = "";
        });
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
    if (config.type === "strip" && config.segmented) {
      const bounds = svg.getBoundingClientRect();
      const x = (event.clientX - bounds.left) * layout.width / (bounds.width || layout.width);
      const y = (event.clientY - bounds.top) * layout.height / (bounds.height || layout.height);
      if (x < 0 || x > layout.width || y < 0 || y > layout.height || !layout.shapes.length) return -1;
      const segments = layout.shapes.filter(shape => shape.attrs.class !== "viz-strip-hit");
      const first = segments[0].attrs;
      const step = segments.length > 1 ? Number(segments[1].attrs.x) - Number(first.x) : layout.width;
      const position = Math.max(0, Math.min(segments.length - 1, Math.round((x - Number(first.x) - Number(first.width) / 2) / step)));
      const index = segments[position].attrs["data-strip-index"];
      return index === undefined ? -1 : Number(index);
    }
    if (config.type === "strip" || config.type === "donut") {
      const attr = config.type === "donut" ? "data-donut-index" : "data-strip-index";
      const segment = (event.target as Element).closest(`[${attr}]`);
      return segment ? Number(segment.getAttribute(attr)) : -1;
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
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener("pointermove", event => {
    const dragging = linePointer === event.pointerId;
    if (touchTooltipIndex >= 0 && !dragging) return;
    if (!dragging && (pinned || event.pointerType === "touch")) return;
    const index = closest(event);
    if (isLine() && index === active && !dragging) return;
    if (dragging) pinned = true;
    if (config.type === "donut" && index >= 0 && index !== stripSelection) selectStrip(index);
    display(index, false, config.type === "donut" || (config.type === "strip" && config.segmented) ? event : undefined);
  });
  svg.addEventListener("pointerup", event => {
    if (!event.isPrimary || event.button !== 0) return;
    const index = closest(event);
    if (event.pointerType === "touch" && !(config.type === "strip" && config.segmented)) {
      if (index < 0 || touchTooltipIndex === index) {
        touchTooltipIndex = -1;
        pinned = false;
        display(-1, true);
      } else {
        touchTooltipIndex = index;
        if (config.type === "strip" || config.type === "donut") selectStrip(index);
        else pinned = true;
        display(index, true, config.type === "donut" ? event : undefined);
      }
      return;
    }
    if (config.type === "strip" && config.segmented) {
      if (event.pointerType === "touch") touchTooltipIndex = index < 0 || touchTooltipIndex === index ? -1 : index;
      display(event.pointerType === "touch" ? touchTooltipIndex : index, false, event);
    } else if (config.type === "strip" || config.type === "donut") { selectStrip(index); if (config.type === "donut") display(index, false, event); }
    else if (index >= 0) {
      pinned = true;
      display(index, true);
    }
  });
  svg.addEventListener("lostpointercapture", () => { linePointer = null; });
  svg.addEventListener("dragstart", event => event.preventDefault());
  svg.addEventListener("pointerleave", () => {
    if (!pinned && touchTooltipIndex < 0) display(-1, true);
  });
  scroller.addEventListener("blur", () => {
    pinned = false;
    touchTooltipIndex = -1;
    display(-1);
  });
  scroller.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      pinned = false;
      touchTooltipIndex = -1;
      display(-1, true);
      return;
    }
    if (!layout?.marks.length) return;
    if ((config.type === "strip" || config.type === "donut") && active >= 0 && [" ", "Enter"].includes(event.key)) {
      event.preventDefault();
      if (config.type === "strip" && config.segmented) display(active);
      else selectStrip(active);
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
  const dismissTooltip = () => {
    pinned = false;
    touchTooltipIndex = -1;
    if (!tooltip.hidden) display(-1);
  };
  const dismissOutside = (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (target && card.contains(target) && (target.closest(".viz-legend button") || (svg.contains(target) && (config.type !== "strip" || !config.segmented || closest(event) >= 0)))) return;
    dismissTooltip();
  };
  const dismissOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && (touchTooltipIndex >= 0 || card.contains(host.ownerDocument.activeElement))) dismissTooltip();
  };
  host.ownerDocument.addEventListener("pointerdown", dismissOutside);
  host.ownerDocument.addEventListener("keydown", dismissOnEscape);
  host.ownerDocument.addEventListener("scroll", dismissTooltip, true);
  const observer = new ResizeObserver(draw);
  render();
  observer.observe(scroller);
  return {
    update(next: ChartConfig, transition?: { timeHorizon?: boolean }) {
      const doHorizon = transition?.timeHorizon && next.type === config.type && !options.demoState
        && ["column", "line", "line-column", "range-column", "heatmap"].includes(next.type)
        && svg.isConnected && layout;
      const oldState = doHorizon ? captureHorizon(svg, config) : undefined;
      stopHorizonAnimation?.();
      stopHorizonAnimation = undefined;
      touchTooltipIndex = -1;
      if (next.type === "strip" || next.type === "donut") {
        const previous = config.type === next.type ? config : undefined;
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
      if (oldState) stopHorizonAnimation = animateHorizon(svg, oldState, next, !!reducedMotion?.matches);
    },
    setLoadingStyle(style: "skeleton" | "spinner") {
      options.loadingStyle = style;
      if (options.demoState === "loading") render();
    },
    getData() {
      const data = layout ?? chartLayout(config, 320, options);
      return data.marks.flatMap(mark => mark.values.map(([series, value]) => ({ label: mark.label, series, value })));
    },
    destroy() { stopHorizonAnimation?.(); observer.disconnect(); host.ownerDocument.removeEventListener("pointerdown", dismissOutside); host.ownerDocument.removeEventListener("keydown", dismissOnEscape); host.ownerDocument.removeEventListener("scroll", dismissTooltip, true); if (retryTimer !== undefined) window.clearTimeout(retryTimer); card.remove(); },
  };
}
