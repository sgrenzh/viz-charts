import { mountChart, type ChartConfig, type LegendPosition } from "../src/charts.js";
import { presets } from "./presets.js";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const gallery = byId("gallery");
const chartTypes = byId("chart-types");
const siteSettings = byId<HTMLDialogElement>("site-settings");
const sitePalette = byId<HTMLSelectElement>("site-palette");
const siteThemeOptions = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="site-theme"]'));
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
const chartPalette = byId<HTMLSelectElement>("chart-palette");
const themeOptions = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="chart-theme"]'));
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
function chartFamily(config: ChartConfig) {
  return config.type === "column" && config.stacked ? "stacked" : config.type;
}
const presetFamilies = presets.map(({ config }) => chartFamily(config));
const chartThemes = ["system", "light", "dark"] as const;
const chartPalettes = ["monochrome", "blue", "orange", "green"] as const;
interface Appearance {
  theme: typeof chartThemes[number];
  palette: typeof chartPalettes[number];
}
const siteAppearanceKey = "viz-site-appearance";
const chartAppearanceKey = "viz-chart-appearance";
const themeQuery = matchMedia("(prefers-color-scheme: dark)");

function readStored(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}

function readAppearance(value: unknown): Partial<Appearance> {
  if (!isRecord(value)) return {};
  return {
    theme: chartThemes.find(theme => theme === value.theme),
    palette: chartPalettes.find(palette => palette === value.palette),
  };
}

const savedSite = readAppearance(readStored(siteAppearanceKey) ?? readStored("viz-gallery-appearance"));
let siteAppearance: Appearance = {
  theme: savedSite.theme ?? "system",
  palette: savedSite.palette ?? "monochrome",
};
const storedCharts = readStored(chartAppearanceKey);
const appearances = presets.map(({ config }): Partial<Appearance> => {
  const { theme, palette } = readAppearance(isRecord(storedCharts) ? storedCharts[config.title] : null);
  return { theme: theme === "system" ? undefined : theme, palette };
});

function isDark(theme: Appearance["theme"]) {
  return theme === "dark" || (theme === "system" && themeQuery.matches);
}

function styleChartAppearance(host: HTMLElement, index: number) {
  const { theme, palette } = appearances[index];
  host.dataset.chartTheme = isDark(theme ?? siteAppearance.theme) ? "dark" : "light";
  host.dataset.chartPalette = palette ?? siteAppearance.palette;
}

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
  sliders: '<path d="M3 6h9m4 0h5M3 12h5m4 0h9M3 18h11m4 0h3M12 4v4M8 10v4m6 2v4"/>',
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
function syncSelectPill(select: HTMLSelectElement) {
  const label = select.parentElement?.querySelector(".select-pill-label");
  if (label) label.textContent = select.options[select.selectedIndex]?.textContent ?? "";
}

document.querySelectorAll<HTMLSelectElement>(".select-pill select").forEach(select => {
  const label = document.createElement("span");
  label.className = "select-pill-label";
  label.setAttribute("aria-hidden", "true");
  select.after(label, icon("chevron"));
  syncSelectPill(select);
  select.addEventListener("change", () => syncSelectPill(select));
});
const siteSettingsButton = byId("open-site-settings");
siteSettingsButton.append(icon("settings"));
siteSettingsButton.addEventListener("click", () => {
  sitePalette.value = siteAppearance.palette;
  syncSelectPill(sitePalette);
  const theme = isDark(siteAppearance.theme) ? "dark" : "light";
  siteThemeOptions.forEach(option => { option.checked = option.value === theme; });
  siteSettings.showModal();
});

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

function createChartControls(index: number) {
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
  const settings = button("Settings", "settings");
  settings.append("Settings");
  const data = button("View chart data", "data");
  settings.setAttribute("aria-haspopup", "dialog");
  settings.setAttribute("aria-controls", editor.id);
  data.setAttribute("aria-haspopup", "dialog");
  range.append(trigger, menu);

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
  return { settings, range, data, refresh };
}

const charts = presets.map(({ span }, index) => {
  const card = document.createElement("div");
  card.className = "gallery-tile";
  card.style.setProperty("--span", String(span));
  const host = document.createElement("div");
  host.className = "chart-theme";
  styleChartAppearance(host, index);
  const settingsButton = button(`Chart settings for ${configs[index].title}`, "sliders");
  settingsButton.classList.add("tile-settings");
  settingsButton.setAttribute("aria-haspopup", "dialog");
  settingsButton.setAttribute("aria-controls", preview.id);
  settingsButton.addEventListener("click", () => showPreview(index));
  const { settings, range, data, refresh } = createChartControls(index);
  const actions = document.createElement("div");
  actions.className = "tile-actions";
  data.setAttribute("aria-controls", dataDialog.id);
  actions.append(data, settingsButton);
  card.append(host, actions);
  gallery.append(card);
  return { card, host, settings, range, refresh, settingsButton, ...mountChart(host, previewConfig(index)) };
});

let activeFamily = "all";
const filters = Object.entries({ all: "All", ...familyLabels }).map(([family, label]) => {
  const pill = document.createElement("button");
  pill.type = "button";
  pill.textContent = label;
  pill.setAttribute("aria-controls", gallery.id);
  pill.setAttribute("aria-pressed", String(family === activeFamily));
  pill.addEventListener("focus", () => {
    if (pill.matches(":focus-visible")) pill.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  pill.addEventListener("click", () => {
    if (family === activeFamily) return;
    activeFamily = family;
    for (const filter of filters) filter.pill.setAttribute("aria-pressed", String(filter.family === activeFamily));
    charts.forEach((chart, i) => { chart.card.hidden = activeFamily !== "all" && chartFamily(configs[i]) !== activeFamily; });
  });
  chartTypes.append(pill);
  return { family, pill };
});

function updateFilterFade() {
  const remaining = chartTypes.scrollWidth - chartTypes.clientWidth - chartTypes.scrollLeft;
  chartTypes.parentElement?.classList.toggle("can-scroll-right", remaining > 1);
}

chartTypes.addEventListener("scroll", updateFilterFade, { passive: true });
const filterResize = new ResizeObserver(updateFilterFade);
filterResize.observe(chartTypes);
void document.fonts?.ready.then(updateFilterFade);
updateFilterFade();

let previewIndex = -1;
let detail: ReturnType<typeof mountChart> | undefined;
let detailPlot: HTMLElement | null = null;
let detailWidth = 0;
const detailResize = new ResizeObserver(resizeDetail);

function previewConfig(index: number) {
  return { ...viewConfig(index), period: undefined };
}

function syncPreview(index: number) {
  byId("preview-heading").textContent = configs[index].title;
  byId("preview-range-label").textContent = configs[index].type === "strip" ? "Sort by" : "Date range";
  example.options[example.selectedIndex].textContent = configs[index].title;
  syncSelectPill(example);
}

function syncPreviewAppearance(index: number) {
  const appearance = appearances[index];
  chartPalette.value = appearance.palette ?? "site";
  syncSelectPill(chartPalette);
  themeOptions.forEach(option => { option.checked = option.value === (appearance.theme ?? "site"); });
  styleChartAppearance(previewHost, index);
}

function storeChartAppearances() {
  const byTitle = Object.fromEntries(presets.map(({ config }, i) => [config.title, appearances[i]]));
  try { localStorage.setItem(chartAppearanceKey, JSON.stringify(byTitle)); } catch { /* Storage may be unavailable. */ }
}

function saveChartAppearance(index: number) {
  styleChartAppearance(charts[index].host, index);
  if (previewIndex === index) syncPreviewAppearance(index);
  storeChartAppearances();
}

function detailConfig(index: number): ChartConfig {
  const config = previewConfig(index);
  const plotWidth = detailPlot?.clientWidth ?? 0;
  const original = presets[index].config;
  if (plotWidth && config.type === "column" && config.labels.length === 1 && config.barWidth === undefined && "series" in original) {
    const barWidth = Math.min(64, Math.max(8, Math.round(plotWidth / original.labels.length)));
    return { ...config, barWidth };
  }
  return config;
}

function resizeDetail() {
  if (!detail) return;
  const homeWidth = charts[previewIndex].host.firstElementChild?.getBoundingClientRect().width;
  if (homeWidth) preview.style.setProperty("--preview-chart-width", `${homeWidth}px`);
  else preview.style.removeProperty("--preview-chart-width");
  const width = detailPlot?.clientWidth ?? 0;
  if (!width || width === detailWidth) return;
  detailWidth = width;
  detail.update(detailConfig(previewIndex));
}

function clearDetail() {
  detailResize.disconnect();
  detail?.destroy();
  detail = undefined;
  detailPlot = null;
  detailWidth = 0;
}

function showPreview(index: number) {
  const opening = !preview.open;
  const homeCard = charts[index].host.firstElementChild;
  const origin = opening && !matchMedia("(prefers-reduced-motion: reduce)").matches
    ? homeCard?.getBoundingClientRect() : undefined;
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
  syncPreviewAppearance(index);
  previewRange.replaceChildren(charts[index].range);
  previewActions.replaceChildren(charts[index].settings);
  if (opening) preview.showModal();
  if (previewActions.parentElement) previewActions.parentElement.scrollTop = 0;
  detail = mountChart(previewHost, previewConfig(index));
  detailPlot = previewHost.querySelector<HTMLElement>(".viz-plot");
  if (detailPlot) detailResize.observe(detailPlot);
  if (homeCard) detailResize.observe(homeCard);
  resizeDetail();
  if (opening) preview.scrollTop = 0;
  const card = previewHost.firstElementChild;
  if (origin?.width && origin.height && card) {
    const target = card.getBoundingClientRect();
    card.animate([
      {
        transform: `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${origin.width / target.width}, ${origin.height / target.height})`,
        transformOrigin: "top left",
        zIndex: 3,
      },
      { transform: "none", transformOrigin: "top left", zIndex: 3 },
    ], { duration: 300, easing: "cubic-bezier(.2, .8, .25, 1)" });
  }
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
  chart.card.hidden = activeFamily !== "all" && chartFamily(configs[index]) !== activeFamily;
  chart.refresh();
  chart.settingsButton.setAttribute("aria-label", `Chart settings for ${configs[index].title}`);
  chart.settingsButton.title = `Chart settings for ${configs[index].title}`;
  const config = previewConfig(index);
  chart.update(config);
  if (previewIndex === index && detail) {
    detail.update(detailConfig(index));
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
  const schemeAccent = getComputedStyle(charts[chosen].host).getPropertyValue("--viz-page-accent").trim();
  accent.value = /^#[0-9a-f]{6}$/i.test(ownAccent ?? "") ? ownAccent! : schemeAccent || "#343434";
  font.value = config.theme?.fontFamily ?? "";
  const hasAxes = "series" in config;
  byId("axes").hidden = !hasAxes;
  xAxis.checked = hasAxes && config.xAxis?.show !== false;
  yAxis.checked = hasAxes && config.yAxis?.show !== false;
  grid.checked = hasAxes && config.grid !== false;
  byId("legend-position-field").hidden = config.type !== "strip";
  legendPosition.value = config.type === "strip" ? config.legendPosition ?? "right" : "right";
  syncSelectPill(legendPosition);
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

function applySiteAppearance() {
  const dark = isDark(siteAppearance.theme);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0d0d0d" : "#ffffff");
  charts.forEach(({ host }, index) => styleChartAppearance(host, index));
  if (previewIndex >= 0) styleChartAppearance(previewHost, previewIndex);
}
applySiteAppearance();
themeQuery.addEventListener("change", applySiteAppearance);

function useSchemeAccent(index: number) {
  const config = configs[index];
  if (config.theme?.accent === undefined) return;
  configs[index] = { ...config, theme: { ...config.theme, accent: undefined } };
  drawChart(index);
}

byId("site-appearance").addEventListener("submit", event => {
  event.preventDefault();
  const theme = chartThemes.find(value => value === siteThemeOptions.find(option => option.checked)?.value);
  const palette = chartPalettes.find(value => value === sitePalette.value);
  if (!theme || !palette) return;
  siteAppearance = { theme, palette };
  charts.forEach((_, index) => {
    appearances[index] = {};
    useSchemeAccent(index);
  });
  applySiteAppearance();
  try { localStorage.setItem(siteAppearanceKey, JSON.stringify(siteAppearance)); } catch { /* Storage may be unavailable. */ }
  storeChartAppearances();
  siteSettings.close();
});

themeOptions.forEach(option => option.addEventListener("change", () => {
  const theme = chartThemes.find(value => value === option.value);
  if (previewIndex < 0 || !option.checked || (!theme && option.value !== "site")) return;
  appearances[previewIndex].theme = theme;
  saveChartAppearance(previewIndex);
}));
chartPalette.addEventListener("change", () => {
  const index = previewIndex;
  const palette = chartPalettes.find(value => value === chartPalette.value);
  if (index < 0 || (!palette && chartPalette.value !== "site")) return;
  appearances[index].palette = palette;
  saveChartAppearance(index);
  useSchemeAccent(index);
});
for (const dialog of [siteSettings, preview, editor, dataDialog]) {
  const close = dialog.querySelector("[data-close]");
  if (!close?.hasChildNodes()) close?.append(icon("close"));
  close?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog || (dialog === preview && event.target === preview.firstElementChild)) dialog.close();
  });
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
  appearances[chosen] = {};
  saveChartAppearance(chosen);
  update(structuredClone(presets[chosen].config));
  status.textContent = "Preset restored.";
});
