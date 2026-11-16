import { mountChart, type ChartConfig, type LegendPosition } from "../src/charts.js";
import { presets } from "./presets.js";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const gallery = byId("gallery");
const preview = byId<HTMLDialogElement>("preview");
const previewHost = byId("preview-chart");
const previewActions = byId("preview-controls");
const previewRange = byId("preview-range");
const exampleField = byId("example-field");
const example = byId<HTMLSelectElement>("preview-example");
const editor = byId<HTMLDialogElement>("editor");
const dataDialog = byId<HTMLDialogElement>("data-dialog");
const title = byId<HTMLInputElement>("title");
const accent = byId<HTMLInputElement>("accent");
const inheritAccent = byId<HTMLInputElement>("inherit-accent");
const pagePalette = byId<HTMLSelectElement>("page-palette");
const themeOptions = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="page-theme"]'));
const font = byId<HTMLInputElement>("font");
const xAxis = byId<HTMLInputElement>("axis-x");
const yAxis = byId<HTMLInputElement>("axis-y");
const grid = byId<HTMLInputElement>("grid");
const legendPosition = byId<HTMLSelectElement>("legend-position");
const showVolume = byId<HTMLInputElement>("show-volume");
const source = byId<HTMLTextAreaElement>("config");
const status = byId("status");
const familyLabels = {
  column: "Column",
  stacked: "Stacked column",
  line: "Line",
  "line-column": "Line + column",
  heatmap: "Calendar heatmap",
  strip: "Proportional strip",
};
const presetFamilies = presets.map(({ config }) => config.type === "column" && config.stacked ? "stacked" : config.type);

interface View { label: string; count?: number }
const dayMs = 86_400_000;
const shortRanges: View[] = [{ label: "24 hours", count: 1 }, { label: "One week", count: 7 }];
const calendarRanges: View[] = [...shortRanges, { label: "One month", count: 30 }, { label: "One year" }];
const monthlyRanges: View[] = [...shortRanges, { label: "One month" }];
const viewsByPreset: View[][] = [
  monthlyRanges, monthlyRanges,
  [{ label: "One month", count: 1 }, { label: "Three months", count: 3 }, { label: "Six months" }],
  monthlyRanges, calendarRanges, monthlyRanges, [],
  [{ label: "24 hours", count: 1 }, { label: "One week" }],
  [{ label: "24 hours", count: 1 }, { label: "One week" }],
];
const samplesPerDay = [1, 4, 1, 3, 1, 8, 1, 24, 6];
const stripViews: View[] = [{ label: "By address count" }, { label: "By category" }];
const configs = presets.map(({ config }) => structuredClone(config));
const selectedViews = presets.map(({ config }, index) => config.type === "strip" ? 0 : viewsByPreset[index].length - 1);
let chosen = 0;
let closeCurrentMenu: (() => void) | undefined;

const icons = {
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  settings: '<path d="M10 3h4l.6 2.6 2 .9 2.3-.9 2 3.4-1.8 1.7v2.6l1.8 1.7-2 3.4-2.3-.9-2 .9L14 21h-4l-.6-2.6-2-.9-2.3.9-2-3.4 1.8-1.7v-2.6L3.1 9l2-3.4 2.3.9 2-.9z"/><circle cx="12" cy="12" r="3"/>',
  data: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M10 9v11"/>',
};
function icon(name: keyof typeof icons) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = icons[name];
  return svg;
}
function button(name: string, iconName: keyof typeof icons) {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "icon-button";
  control.setAttribute("aria-label", name);
  control.title = name;
  control.append(icon(iconName));
  return control;
}
preview.querySelectorAll(".select-pill").forEach(pill => pill.append(icon("chevron")));

function viewsFor(index: number) {
  const config = configs[index];
  if (config.type === "strip") return stripViews;
  if (config.type === "heatmap") return calendarRanges;
  return viewsByPreset[index].length ? viewsByPreset[index] : monthlyRanges;
}
function viewConfig(index: number): ChartConfig {
  const config = configs[index];
  const view = viewsFor(index)[selectedViews[index]];
  if (config.type === "strip" && selectedViews[index] === 1) {
    const selectedItem = config.items[config.selected ?? -1];
    const items = config.items.slice().sort((a, b) => a.label.localeCompare(b.label));
    return { ...config, items, selected: selectedItem ? items.indexOf(selectedItem) : undefined };
  }
  if (!view?.count) return config;
  if (config.type === "heatmap") {
    const last = config.days.reduce((latest, day) => Math.max(latest, Date.parse(day.date)), -Infinity);
    const first = last - (view.count - 1) * dayMs;
    return { ...config, days: config.days.filter(day => Date.parse(day.date) >= first) };
  }
  if ("series" in config) {
    const count = view.count * samplesPerDay[index];
    const labels = config.labels.slice(-count);
    const series = config.series.map(item => ({ ...item, values: item.values.slice(-count) }));
    const aggregate = index === 0 || index === 2;
    const sum = series[0]?.values.reduce<number>((total, value) => total + (value ?? 0), 0);
    const headline = aggregate && config.headline && sum !== undefined ? sum.toLocaleString("en") : config.headline;
    return { ...config, labels, series, headline };
  }
  return config;
}

function createToolbar(index: number) {
  const toolbar = document.createElement("div");
  toolbar.className = "chart-toolbar";
  const range = document.createElement("div");
  range.className = "chart-range";
  const trigger = button("Chart range", "chevron");
  trigger.classList.add("range-trigger");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "range-menu";
  menu.id = `chart-range-${index}`;
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  trigger.setAttribute("aria-controls", menu.id);
  const rangeText = document.createElement("span");
  trigger.prepend(rangeText);
  const settings = button("Chart settings", "settings");
  const data = button("View chart data", "data");
  settings.setAttribute("aria-haspopup", "dialog");
  data.setAttribute("aria-haspopup", "dialog");
  range.append(trigger, menu);
  toolbar.append(settings, data);

  function refresh() {
    const config = configs[index];
    const current = viewsFor(index)[selectedViews[index]];
    rangeText.textContent = current.label;
    trigger.setAttribute("aria-label", `${config.title}: ${current.label}`);
    settings.setAttribute("aria-label", `Settings for ${config.title}`);
    data.setAttribute("aria-label", `View data for ${config.title}`);
    menu.setAttribute("aria-label", config.type === "strip" ? "Sort categories" : "Date range");
  }
  function close(restoreFocus = false) {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (closeCurrentMenu === close) closeCurrentMenu = undefined;
    if (restoreFocus) trigger.focus();
  }
  function open() {
    closeCurrentMenu?.();
    const active = selectedViews[index];
    const options = viewsFor(index);
    menu.style.setProperty("--active-row", String(active));
    menu.replaceChildren(...options.map((view, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(i === active));
      item.textContent = view.label;
      if (i === active) item.append(icon("check"));
      item.addEventListener("click", () => {
        selectedViews[index] = i;
        close();
        drawChart(index);
        trigger.focus();
      });
      return item;
    }));
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    closeCurrentMenu = close;
    (menu.children[active] as HTMLElement).focus({ preventScroll: true });
    menu.scrollIntoView({ block: "nearest" });
  }
  trigger.addEventListener("click", () => { if (menu.hidden) open(); else close(); });
  trigger.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (menu.hidden) open();
    }
  });
  menu.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key === "Tab") { close(); return; }
    const items = Array.from(menu.querySelectorAll("button"));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const length = items.length;
    const next = event.key === "Home" ? 0 : event.key === "End" ? length - 1
      : event.key === "ArrowDown" ? (index + 1) % length : event.key === "ArrowUp" ? (index - 1 + length) % length : -1;
    if (next >= 0) { event.preventDefault(); items[next].focus(); }
  });
  document.addEventListener("click", event => {
    if (!menu.hidden && !range.contains(event.target as Node)) close();
  });
  settings.addEventListener("click", () => {
    chosen = index;
    status.textContent = "";
    sync();
    editor.showModal();
  });
  data.addEventListener("click", () => showData(index));
  refresh();
  return { toolbar, range, refresh };
}

const charts = presets.map(({ span }, index) => {
  const card = document.createElement("div");
  card.className = "gallery-tile";
  card.style.setProperty("--span", String(span));
  const host = document.createElement("div");
  host.inert = true;
  const opener = button(`Preview ${configs[index].title}`, "chevron");
  opener.className = "tile-opener";
  opener.setAttribute("aria-haspopup", "dialog");
  opener.addEventListener("click", () => showPreview(index));
  card.append(host, opener);
  gallery.append(card);
  const { toolbar, range, refresh } = createToolbar(index);
  return { toolbar, range, refresh, opener, ...mountChart(host, previewConfig(index)) };
});

for (const [family, label] of Object.entries(familyLabels)) {
  const first = presetFamilies.findIndex(value => value === family);
  if (first < 0) continue;
  const pill = document.createElement("button");
  pill.type = "button";
  pill.textContent = label;
  pill.setAttribute("aria-haspopup", "dialog");
  pill.addEventListener("click", () => showPreview(first));
  byId("chart-types").append(pill);
}

let previewIndex = -1;
let detail: ReturnType<typeof mountChart> | undefined;
let detailPlot: HTMLElement | null = null;
let detailWidth = 0;
let detailHeight: number | undefined;
const detailResize = new ResizeObserver(resizeDetail);

function previewConfig(index: number) {
  return { ...viewConfig(index), period: undefined };
}

function syncPreview(index: number) {
  byId("preview-heading").textContent = configs[index].title;
  byId("preview-range-label").textContent = configs[index].type === "strip" ? "Sort by" : "Date range";
  example.selectedOptions[0].textContent = configs[index].title;
}

function detailConfig(index: number): ChartConfig {
  const config = previewConfig(index);
  const plotWidth = detailPlot?.clientWidth ?? 0;
  const card = detailPlot?.closest<HTMLElement>(".viz-card");
  const heading = card?.querySelector<HTMLElement>(".viz-heading");
  if (!plotWidth || !card || !heading || config.type === "heatmap") return config;
  const [referenceWidth, referenceHeight] = presets[index].sourceSize;
  const cardStyle = getComputedStyle(card);
  const headingStyle = getComputedStyle(heading);
  const nonPlotHeight = heading.offsetHeight + [headingStyle.marginBottom, cardStyle.paddingTop, cardStyle.paddingBottom, cardStyle.borderTopWidth, cardStyle.borderBottomWidth]
    .reduce((height, value) => height + (parseFloat(value) || 0), 0);
  const desiredHeight = card.offsetWidth * referenceHeight / referenceWidth;
  const minimumHeight = config.type === "line-column" && config.showVolume !== false ? 128 : 96;
  const height = Math.max(minimumHeight, Math.round(desiredHeight - nonPlotHeight));
  const original = presets[index].config;
  if (config.type === "column" && config.labels.length === 1 && config.barWidth === undefined && "series" in original) {
    const barWidth = Math.min(64, Math.max(8, Math.round(plotWidth / original.labels.length)));
    return { ...config, height, barWidth };
  }
  return { ...config, height };
}

function resizeDetail() {
  const width = detailPlot?.clientWidth ?? 0;
  if (!detail || !width) return;
  const config = detailConfig(previewIndex);
  if (width === detailWidth && config.height === detailHeight) return;
  detailWidth = width;
  detailHeight = config.height;
  detail.update(config);
}

function clearDetail() {
  detailResize.disconnect();
  detail?.destroy();
  detail = undefined;
  detailPlot = null;
  detailWidth = 0;
  detailHeight = undefined;
}

function showPreview(index: number) {
  closeCurrentMenu?.();
  clearDetail();
  previewIndex = index;
  const family = presetFamilies[index];
  const examples = configs.flatMap((config, i) => {
    if (presetFamilies[i] !== family) return [];
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = config.title;
    return [option];
  });
  example.replaceChildren(...examples);
  example.value = String(index);
  exampleField.hidden = examples.length < 2;
  syncPreview(index);
  previewRange.replaceChildren(charts[index].range);
  previewActions.replaceChildren(charts[index].toolbar);
  previewHost.style.setProperty("--preview-chart-width", `${Math.round(presets[index].sourceSize[0] * 0.7)}px`);
  const opening = !preview.open;
  if (opening) preview.showModal();
  detail = mountChart(previewHost, previewConfig(index));
  detailPlot = previewHost.querySelector<HTMLElement>(".viz-plot");
  if (detailPlot) detailResize.observe(detailPlot);
  const heading = previewHost.querySelector<HTMLElement>(".viz-heading");
  if (heading) detailResize.observe(heading);
  resizeDetail();
  if (opening) preview.scrollTop = 0;
}

example.addEventListener("change", () => showPreview(Number(example.value)));
preview.addEventListener("close", () => {
  if (preview.open) return;
  closeCurrentMenu?.();
  clearDetail();
  previewIndex = -1;
});

function drawChart(index: number) {
  const chart = charts[index];
  chart.refresh();
  chart.opener.setAttribute("aria-label", `Preview ${configs[index].title}`);
  chart.opener.title = `Preview ${configs[index].title}`;
  const config = previewConfig(index);
  chart.update(config);
  if (previewIndex === index && detail) {
    const next = detailConfig(index);
    detailHeight = next.height;
    detail.update(next);
    syncPreview(index);
  }
}

function sync() {
  const config = configs[chosen];
  byId("chart-name").textContent = config.title;
  title.value = config.title;
  const ownAccent = config.theme?.accent;
  inheritAccent.checked = ownAccent === undefined;
  accent.disabled = inheritAccent.checked;
  const galleryAccent = getComputedStyle(gallery).getPropertyValue("--viz-page-accent").trim();
  accent.value = /^#[0-9a-f]{6}$/i.test(ownAccent ?? "") ? ownAccent! : galleryAccent;
  font.value = config.theme?.fontFamily ?? "";
  const hasAxes = "series" in config;
  byId("axes").hidden = !hasAxes;
  xAxis.checked = hasAxes && config.xAxis?.show !== false;
  yAxis.checked = hasAxes && config.yAxis?.show !== false;
  grid.checked = hasAxes && config.grid !== false;
  byId("legend-position-field").hidden = config.type !== "strip";
  legendPosition.value = config.type === "strip" ? config.legendPosition ?? "right" : "right";
  byId("show-volume-field").hidden = config.type !== "line-column";
  showVolume.checked = config.type === "line-column" && config.showVolume !== false;
  source.value = JSON.stringify(config, null, 2);
}

function update(config: ChartConfig) {
  const typeChanged = config.type !== configs[chosen].type;
  configs[chosen] = config;
  if (typeChanged) selectedViews[chosen] = config.type === "strip" ? 0 : viewsFor(chosen).length - 1;
  drawChart(chosen);
  sync();
}

function applyControls() {
  let config = configs[chosen];
  config = {
    ...config,
    title: title.value.trim() || presets[chosen].config.title,
    theme: { ...config.theme, accent: inheritAccent.checked ? undefined : accent.value, fontFamily: font.value.trim() || undefined },
  };
  if ("series" in config) {
    config = { ...config, grid: grid.checked, xAxis: { ...config.xAxis, show: xAxis.checked }, yAxis: { ...config.yAxis, show: yAxis.checked } };
  }
  update(config);
}

function showData(index: number) {
  const rows = charts[index].getData();
  byId("data-name").textContent = configs[index].title + " · " + viewsFor(index)[selectedViews[index]].label;
  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  ["Label", "Series", "Value"].forEach(name => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = name;
    head.append(th);
  });
  const body = table.createTBody();
  rows.forEach(({ label, series, value }) => {
    const row = body.insertRow();
    [label, series, value].forEach(text => { row.insertCell().textContent = text; });
  });
  byId("data-table").replaceChildren(table);
  dataDialog.showModal();
}

const themeQuery = matchMedia("(prefers-color-scheme: dark)");
function applyAppearance() {
  const theme = themeOptions.find(option => option.checked)?.value ?? "system";
  const dark = theme === "dark" || (theme === "system" && themeQuery.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.palette = pagePalette.value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0d0d0d" : "#f2f2f2");
  try { localStorage.setItem("viz-gallery-appearance", JSON.stringify({ theme, palette: pagePalette.value })); } catch { /* Storage may be disabled. */ }
}
try {
  const saved = JSON.parse(localStorage.getItem("viz-gallery-appearance") ?? "{}");
  const savedTheme = themeOptions.find(option => option.value === saved?.theme);
  if (savedTheme) savedTheme.checked = true;
  if (Array.from(pagePalette.options).some(option => option.value === saved?.palette)) pagePalette.value = saved.palette;
} catch { /* Use the defaults when settings are unavailable. */ }
applyAppearance();
themeQuery.addEventListener("change", applyAppearance);
themeOptions.forEach(option => option.addEventListener("change", applyAppearance));
pagePalette.addEventListener("change", applyAppearance);
for (const dialog of [preview, editor, dataDialog]) {
  const close = dialog.querySelector("[data-close]");
  if (!close?.hasChildNodes()) close?.append(icon("close"));
  close?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
}
[title, accent, inheritAccent, font, xAxis, yAxis, grid].forEach(control => control.addEventListener("change", applyControls));
legendPosition.addEventListener("change", () => {
  const config = configs[chosen];
  if (config.type === "strip") update({ ...config, legendPosition: legendPosition.value as LegendPosition });
});
showVolume.addEventListener("change", () => {
  const config = configs[chosen];
  if (config.type === "line-column") update({ ...config, showVolume: showVolume.checked });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const within = (value: unknown, min: number, max: number) => value === undefined || (finite(value) && value >= min && value <= max);
const optionalText = (value: unknown) => value === undefined || typeof value === "string";
function validAxis(axis: unknown) {
  return axis === undefined || (isRecord(axis)
    && (axis.show === undefined || typeof axis.show === "boolean") && optionalText(axis.label)
    && within(axis.min, -1e18, 1e18) && within(axis.max, -1e18, 1e18)
    && (!finite(axis.min) || !finite(axis.max) || axis.min < axis.max)
    && within(axis.digits, 0, 12) && within(axis.ticks, 2, 40)
    && (axis.format === undefined || ["number", "compact", "currency", "percent"].includes(String(axis.format))));
}

function readConfig(text: string): ChartConfig {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.title !== "string" || !parsed.title.trim()
    || !within(parsed.height, 96, 720) || !optionalText(parsed.period) || !optionalText(parsed.headline)
    || (parsed.theme !== undefined && (!isRecord(parsed.theme) || !Object.values(parsed.theme).every(optionalText)))) {
    throw new Error("A version 1 config needs a title and valid display options.");
  }
  if (parsed.type === "heatmap") {
    if (!Array.isArray(parsed.days) || !parsed.days.every(d => isRecord(d) && typeof d.date === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(Date.parse(d.date))
      && new Date(d.date).toISOString().slice(0, 10) === d.date && finite(d.value))) {
      throw new Error("Use valid ISO dates and numeric values for the heatmap.");
    }
    const dates = parsed.days.map(d => Date.parse(d.date));
    if (dates.length && Math.max(...dates) - Math.min(...dates) > 5 * 366 * 86_400_000) throw new Error("The preview supports a heatmap window of up to five years.");
    if (!within(parsed.cellSize, 8, 48) || !within(parsed.gap, 0, 12) || !within(parsed.radius, 0, 24)
      || (parsed.weekStartsOn !== undefined && parsed.weekStartsOn !== 0 && parsed.weekStartsOn !== 1)
      || (parsed.colors !== undefined && (!Array.isArray(parsed.colors) || !parsed.colors.length || !parsed.colors.every(c => typeof c === "string")))
      || (parsed.thresholds !== undefined && (!Array.isArray(parsed.thresholds) || !parsed.thresholds.every(finite)))) throw new Error("Check the heatmap appearance settings.");
  } else if (parsed.type === "strip") {
    if (!Array.isArray(parsed.items) || !parsed.items.every(item => isRecord(item) && typeof item.label === "string"
      && finite(item.value) && item.value >= 0 && optionalText(item.color))) throw new Error("Strip segments need labels and nonnegative values.");
    if (parsed.legendPosition !== undefined && parsed.legendPosition !== "below" && parsed.legendPosition !== "right" && parsed.legendPosition !== "left") {
      throw new Error("Choose below, right, or left for the list position.");
    }
  } else if (parsed.type === "column" || parsed.type === "line" || parsed.type === "line-column") {
    const labels = parsed.labels;
    if (!Array.isArray(labels) || !labels.every(x => typeof x === "string") || !Array.isArray(parsed.series)
      || !parsed.series.every(s => isRecord(s) && typeof s.name === "string" && Array.isArray(s.values) && s.values.length === labels.length
        && s.values.every(v => v === null || finite(v)) && optionalText(s.color))
      || (parsed.type === "line-column" && parsed.series.length !== 2)) throw new Error("Provide labels and matching series values. Combo charts need two series.");
    if (!validAxis(parsed.xAxis) || !validAxis(parsed.yAxis) || !within(parsed.barRadius, 0, 40) || !within(parsed.barWidth, 1, 160)) {
      throw new Error("Check the axis and bar settings.");
    }
    if (parsed.type === "line-column" && parsed.showVolume !== undefined && typeof parsed.showVolume !== "boolean") {
      throw new Error("Show volume must be true or false.");
    }
  } else {
    throw new Error("Unknown chart type.");
  }
  return parsed as unknown as ChartConfig;
}

byId("apply").addEventListener("click", () => {
  try {
    update(readConfig(source.value));
    status.textContent = "Configuration applied.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Invalid configuration.";
  }
});
byId("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(source.value);
    status.textContent = "Configuration copied.";
  } catch {
    source.focus();
    source.select();
    status.textContent = "Configuration selected. Use your device’s copy command.";
  }
});
byId("reset").addEventListener("click", () => {
  update(structuredClone(presets[chosen].config));
  status.textContent = "Preset restored.";
});
