import { mountChart, type ChartConfig, type LegendPosition } from "../src/charts.js";
import { presets } from "./presets.js";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const gallery = byId("gallery");
const chartTypes = byId("chart-types");
const siteSettings = byId<HTMLDialogElement>("site-settings");
const sitePalette = byId<HTMLSelectElement>("site-palette");
const siteThemeOptions = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="site-theme"]'));
const preview = byId<HTMLDialogElement>("preview");
const previewContent = byId("preview-content");
const previewStage = byId("preview-stage");
const previewClose = byId("preview-close");
const previewFields = byId("preview-fields");
const previewHost = byId("preview-chart");
const previewActions = byId("preview-controls");
const previewRange = byId("preview-range");
const editor = byId<HTMLDialogElement>("editor");
const chartPalette = byId<HTMLSelectElement>("chart-palette");
const themeOptions = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="chart-theme"]'));
const xAxis = byId<HTMLInputElement>("axis-x");
const yAxis = byId<HTMLInputElement>("axis-y");
const grid = byId<HTMLInputElement>("grid");
const gradientFill = byId<HTMLInputElement>("gradient-fill");
const legendPosition = byId<HTMLSelectElement>("legend-position");
const showVolume = byId<HTMLInputElement>("show-volume");
const source = byId<HTMLTextAreaElement>("config");
const status = byId("status");
const familyLabels = {
  column: "Column",
  stacked: "Stacked column",
  line: "Line",
  heatmap: "Calendar heatmap",
  strip: "Proportional strip",
};
function chartFamily(config: ChartConfig) {
  return config.type === "column" && config.stacked ? "stacked" : config.type;
}
const chartTypeLabels: Record<ReturnType<typeof chartFamily>, string> = {
  column: "Column chart",
  stacked: "Stacked column chart",
  line: "Line chart",
  "line-column": "Line and column chart",
  heatmap: familyLabels.heatmap,
  strip: familyLabels.strip,
};
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
const siteAppearance: Appearance = {
  theme: savedSite.theme ?? "system",
  palette: savedSite.palette ?? "monochrome",
};
const storedCharts = readStored(chartAppearanceKey);
const appearances = presets.map(({ config, previousTitle }): Partial<Appearance> => {
  const { theme, palette } = readAppearance(isRecord(storedCharts) ? storedCharts[config.title] ?? storedCharts[previousTitle] : null);
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
const stripViews: View[] = [{ label: "By item count" }, { label: "By category" }];
const configs = presets.map(({ config }) => structuredClone(config));
const selectedViews = presets.map(({ config }, index) => config.type === "strip" ? 0 : viewsByPreset[index].length - 1);
let closeCurrentMenu: (() => void) | undefined;

const icons = {
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  code: '<path d="M13.5 6 10 18.5M6.5 8.5 3 12l3.5 3.5M17.5 8.5 21 12l-3.5 3.5" stroke-width="1.5"/>',
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
function createDropdown(id: string, onSelect: (index: number) => void) {
  const root = document.createElement("div");
  root.className = "dropdown";
  const trigger = button("", "chevron");
  trigger.removeAttribute("title");
  trigger.classList.add("dropdown-trigger");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", id);
  const text = document.createElement("span");
  trigger.prepend(text);
  const menu = document.createElement("div");
  menu.className = "dropdown-menu";
  menu.id = id;
  menu.setAttribute("popover", "manual");
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  root.append(trigger, menu);

  let labels: string[] = [];
  let selected = 0;
  function refresh(options: string[], index: number, label: string) {
    labels = options;
    selected = index;
    text.textContent = labels[selected] ?? "";
    trigger.setAttribute("aria-label", `${label}: ${text.textContent}`);
    menu.setAttribute("aria-label", label);
  }

  function place() {
    if (menu.hidden) return;
    const bounds = trigger.getBoundingClientRect();
    menu.style.minWidth = `${Math.min(bounds.width, window.innerWidth - 16)}px`;
    const active = menu.children[selected] as HTMLElement | undefined;
    const top = bounds.top + (bounds.height - (active?.offsetHeight ?? 0)) / 2 - (active?.offsetTop ?? 0);
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, bounds.right - menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, top))}px`;
  }
  function close(restoreFocus = false) {
    if (menu.hidden) return;
    menu.hidePopover?.();
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    window.removeEventListener("resize", place);
    document.removeEventListener("scroll", place, true);
    if (closeCurrentMenu === close) closeCurrentMenu = undefined;
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function open() {
    if (!labels.length) return;
    closeCurrentMenu?.();
    menu.replaceChildren(...labels.map((label, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.tabIndex = -1;
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(index === selected));
      item.textContent = label;
      if (index === selected) item.append(icon("check"));
      item.addEventListener("click", () => {
        close(true);
        onSelect(index);
      });
      return item;
    }));
    menu.hidden = false;
    menu.showPopover?.();
    trigger.setAttribute("aria-expanded", "true");
    closeCurrentMenu = close;
    place();
    (menu.children[selected] as HTMLElement | undefined)?.focus();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
  }
  trigger.addEventListener("click", () => { if (menu.hidden) open(); else close(); });
  trigger.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (menu.hidden) open();
    }
  });
  menu.addEventListener("keydown", event => {
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
      close(true);
      return;
    }
    const items = Array.from(menu.querySelectorAll("button"));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const length = items.length;
    const next = event.key === "Home" ? 0 : event.key === "End" ? length - 1
      : event.key === "ArrowDown" ? (index + 1) % length : event.key === "ArrowUp" ? (index - 1 + length) % length : -1;
    if (next >= 0) { event.preventDefault(); items[next].focus(); }
  });
  document.addEventListener("pointerdown", event => {
    if (!menu.hidden && !root.contains(event.target as Node)) close();
  });
  return { root, refresh };
}

const selectDropdowns = new Map<HTMLSelectElement, ReturnType<typeof createDropdown>>();
function syncSelectDropdown(select: HTMLSelectElement) {
  const label = document.getElementById(select.getAttribute("aria-labelledby") ?? "")?.textContent ?? "";
  selectDropdowns.get(select)?.refresh(Array.from(select.options, option => option.textContent), select.selectedIndex, label);
}
for (const select of [sitePalette, chartPalette, legendPosition]) {
  const dropdown = createDropdown(`${select.id}-menu`, index => {
    select.selectedIndex = index;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  selectDropdowns.set(select, dropdown);
  select.hidden = true;
  select.after(dropdown.root);
  syncSelectDropdown(select);
  select.addEventListener("change", () => syncSelectDropdown(select));
}
const siteSettingsButton = byId("open-site-settings");
siteSettingsButton.append(icon("settings"));
siteSettingsButton.addEventListener("click", () => {
  sitePalette.value = siteAppearance.palette;
  syncSelectDropdown(sitePalette);
  const theme = isDark(siteAppearance.theme) ? "dark" : "light";
  siteThemeOptions.forEach(option => { option.checked = option.value === theme; });
  siteSettings.showModal();
});

function syncSegmentIndicator(segment: HTMLElement) {
  const selected = segment.querySelector("input:checked")?.parentElement?.getBoundingClientRect();
  if (!selected?.width) {
    segment.removeAttribute("data-indicator");
    return;
  }
  segment.style.setProperty("--indicator-x", `${selected.left - segment.getBoundingClientRect().left}px`);
  segment.style.setProperty("--indicator-width", `${selected.width}px`);
  segment.setAttribute("data-indicator", "");
}

const segmentResize = new ResizeObserver(entries => {
  const segments = new Set(entries.map(({ target }) => target.closest<HTMLElement>(".segmented")));
  segments.forEach(segment => { if (segment) syncSegmentIndicator(segment); });
});
document.querySelectorAll<HTMLElement>(".segmented").forEach(segment => {
  segment.addEventListener("change", () => syncSegmentIndicator(segment));
  segmentResize.observe(segment);
  segment.querySelectorAll("label").forEach(label => segmentResize.observe(label));
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
  const range = createDropdown(`chart-range-${index}`, selected => {
    selectedViews[index] = selected;
    drawChart(index);
  });
  const homeRange = createDropdown(`home-range-${index}`, selected => {
    selectedViews[index] = selected;
    drawChart(index);
  });
  const detailRange = createDropdown(`detail-range-${index}`, selected => {
    selectedViews[index] = selected;
    drawChart(index);
  });
  homeRange.root.classList.add("chart-toolbar");
  detailRange.root.classList.add("chart-toolbar");
  const codeButton = button("Code", "code");
  codeButton.append("Code");
  codeButton.removeAttribute("title");
  codeButton.setAttribute("aria-haspopup", "dialog");
  codeButton.setAttribute("aria-controls", editor.id);
  function refresh() {
    const config = configs[index];
    const labels = viewsFor(index).map(view => view.label);
    range.refresh(labels, selectedViews[index], config.type === "strip" ? "Sort by" : "Date range");
    homeRange.refresh(labels, selectedViews[index], "Date range");
    detailRange.refresh(labels, selectedViews[index], "Date range");
    homeRange.root.hidden = detailRange.root.hidden = config.type === "strip";
    codeButton.setAttribute("aria-label", `Code for ${config.title}`);
  }
  codeButton.addEventListener("click", () => {
    if (!preview.open || preview.hasAttribute("data-closing")) return;
    status.textContent = "";
    syncConfigurator();
    configuratorScroll = { modal: preview.scrollTop, fields: previewFields.scrollTop };
    previewAnimations.splice(0).forEach(animation => animation.cancel());
    preview.close();
    editor.showModal();
  });
  refresh();
  return { codeButton, range: range.root, homeRange: homeRange.root, detailRange: detailRange.root, refresh };
}

const charts = presets.map(({ layout, formatHeadline }, index) => {
  const card = document.createElement("div");
  card.className = "gallery-tile";
  if (layout) card.dataset.layout = layout;
  const host = document.createElement("div");
  host.className = "chart-theme";
  styleChartAppearance(host, index);
  const settingsButton = button(`Chart settings for ${configs[index].title}`, "sliders");
  settingsButton.classList.add("tile-settings");
  settingsButton.setAttribute("aria-haspopup", "dialog");
  settingsButton.setAttribute("aria-controls", preview.id);
  settingsButton.addEventListener("click", () => showPreview(index));
  card.addEventListener("click", event => {
    const target = event.target as Node;
    if (!host.contains(target) && !settingsButton.contains(target)) showPreview(index);
  });
  const { codeButton, range, homeRange, detailRange, refresh } = createChartControls(index);
  const actions = document.createElement("div");
  actions.className = "tile-actions";
  actions.append(settingsButton);
  card.append(host, actions);
  gallery.append(card);
  return { card, host, codeButton, range, homeRange, detailRange, refresh, settingsButton, ...mountChart(host, previewConfig(index), { formatHeadline, controls: homeRange }) };
});

let activeFamily = "all";
function matchesFilter(config: ChartConfig) {
  const family = chartFamily(config);
  return activeFamily === "all" || (family === "line-column" ? "line" : family) === activeFamily;
}
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
    gallery.classList.toggle("is-filtered", family !== "all");
    for (const filter of filters) filter.pill.setAttribute("aria-pressed", String(filter.family === activeFamily));
    charts.forEach((chart, i) => { chart.card.hidden = !matchesFilter(configs[i]); });
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
let configuratorScroll: { modal: number; fields: number } | undefined;
let detail: ReturnType<typeof mountChart> | undefined;
let detailPlot: HTMLElement | null = null;
let detailWidth = 0;
let previewAnimations: Animation[] = [];
const detailResize = new ResizeObserver(resizeDetail);
const mobilePreview = matchMedia("(max-width: 660px)");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const previewDuration = 400;
function updatePreviewFade() {
  const remaining = previewFields.scrollHeight - previewFields.clientHeight - previewFields.scrollTop;
  previewActions.toggleAttribute("data-more-controls", remaining > 1);
}

previewFields.addEventListener("scroll", updatePreviewFade, { passive: true });

function fitPreviewChart() {
  let scale = 1;
  if (mobilePreview.matches && previewHost.offsetHeight) {
    const style = getComputedStyle(previewStage);
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const available = Math.max(0, previewStage.clientHeight - padding);
    scale = Math.min(1, available / previewHost.offsetHeight);
  }
  previewHost.style.setProperty("--preview-scale", String(scale));
  return scale;
}

function previewConfig(index: number) {
  return { ...viewConfig(index), period: undefined };
}

function selectSegment(on: HTMLInputElement, checked: boolean) {
  const selected = checked ? on : byId<HTMLInputElement>(`${on.id}-off`);
  if (selected.checked) return;
  selected.checked = true;
  const segment = selected.closest<HTMLElement>(".segmented");
  if (segment) syncSegmentIndicator(segment);
}

function onSegmentChange(on: HTMLInputElement, listener: () => void) {
  on.addEventListener("change", listener);
  byId<HTMLInputElement>(`${on.id}-off`).addEventListener("change", listener);
}

function syncPreview(index: number) {
  const config = configs[index];
  byId("preview-heading").textContent = chartTypeLabels[chartFamily(config)];
  byId("preview-range-label").textContent = "Sort by";
  byId("preview-range").parentElement!.hidden = config.type !== "strip";
  const hasAxes = "series" in config;
  byId("axes").hidden = !hasAxes;
  selectSegment(xAxis, hasAxes && config.xAxis?.show !== false);
  selectSegment(yAxis, hasAxes && config.yAxis?.show !== false);
  selectSegment(grid, hasAxes && config.grid !== false);
  const hasLine = config.type === "line" || config.type === "line-column";
  byId("gradient-fill-field").hidden = !hasLine;
  selectSegment(gradientFill, hasLine && config.gradientFill === true);
  byId("legend-position-field").hidden = config.type !== "strip";
  legendPosition.value = config.type === "strip" ? config.legendPosition ?? "right" : "right";
  syncSelectDropdown(legendPosition);
  byId("show-volume-field").hidden = config.type !== "line-column";
  selectSegment(showVolume, config.type === "line-column" && config.showVolume !== false);
  updatePreviewFade();
}

function syncPreviewAppearance(index: number) {
  const appearance = appearances[index];
  chartPalette.value = appearance.palette ?? siteAppearance.palette;
  syncSelectDropdown(chartPalette);
  themeOptions.forEach(option => { option.checked = option.value === (appearance.theme ?? "site"); });
  const segment = themeOptions[0]?.closest<HTMLElement>(".segmented");
  if (segment) syncSegmentIndicator(segment);
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
  if (!detail || !preview.open || preview.hasAttribute("data-closing")) return;
  const homeWidth = charts[previewIndex].host.firstElementChild?.getBoundingClientRect().width;
  if (homeWidth) preview.style.setProperty("--preview-chart-width", `${homeWidth}px`);
  else preview.style.removeProperty("--preview-chart-width");
  const width = detailPlot?.clientWidth ?? 0;
  if (width && width !== detailWidth) {
    detailWidth = width;
    detail.update(detailConfig(previewIndex));
  }
  fitPreviewChart();
  updatePreviewFade();
}

function clearDetail() {
  previewAnimations.forEach(animation => animation.cancel());
  previewAnimations = [];
  detailResize.disconnect();
  detail?.destroy();
  detail = undefined;
  detailPlot = null;
  detailWidth = 0;
}

function showPreview(index: number) {
  const opening = !preview.open;
  const homeCard = charts[index].host.firstElementChild;
  const animate = opening && !reducedMotion.matches;
  const origin = animate ? homeCard?.getBoundingClientRect() : undefined;
  const originTile = animate ? charts[index].card.getBoundingClientRect() : undefined;
  closeCurrentMenu?.();
  clearDetail();
  previewIndex = index;
  syncPreview(index);
  syncPreviewAppearance(index);
  previewRange.replaceChildren(charts[index].range);
  previewActions.replaceChildren(charts[index].codeButton);
  if (opening) preview.showModal();
  previewFields.scrollTop = 0;
  detail = mountChart(previewHost, previewConfig(index), { formatHeadline: presets[index].formatHeadline, controls: charts[index].detailRange });
  detailPlot = previewHost.querySelector<HTMLElement>(".viz-plot");
  if (detailPlot) detailResize.observe(detailPlot);
  if (homeCard) detailResize.observe(homeCard);
  detailResize.observe(previewStage);
  detailResize.observe(previewFields);
  detailResize.observe(previewHost);
  resizeDetail();
  if (opening) preview.scrollTop = 0;
  const card = previewHost.firstElementChild;
  if (origin?.width && origin.height && originTile?.width && originTile.height && card) {
    animatePreview(originTile, origin, card);
  }
}

function previewTransforms(originTile: DOMRect, originChart: DOMRect, card: Element) {
  const scale = fitPreviewChart();
  const stage = previewStage.getBoundingClientRect();
  const chart = card.getBoundingClientRect();
  if (!originTile.width || !originTile.height || !originChart.width || !originChart.height
    || !stage.width || !stage.height || !chart.width || !chart.height) return;
  const sx = originTile.width / stage.width;
  const sy = originTile.height / stage.height;
  const stageTransform = `translate(${originTile.left - stage.left}px, ${originTile.top - stage.top}px) scale(${sx}, ${sy})`;
  // Undo the parent's transform when calculating the chart's own starting position.
  const x = ((originChart.left - originTile.left) / sx - (chart.left - stage.left)) / scale;
  const y = ((originChart.top - originTile.top) / sy - (chart.top - stage.top)) / scale;
  const chartTransform = `translate(${x}px, ${y}px) scale(${originChart.width / (chart.width * sx)}, ${originChart.height / (chart.height * sy)})`;
  return { stageTransform, chartTransform };
}

function animatePreview(originTile: DOMRect, originChart: DOMRect, card: Element) {
  const transforms = previewTransforms(originTile, originChart, card);
  if (!transforms) return;
  const { stageTransform, chartTransform } = transforms;
  const timing = { duration: previewDuration, easing: "cubic-bezier(.4, 0, .2, 1)" };
  previewAnimations = [
    previewStage.animate([
      { transform: stageTransform, transformOrigin: "top left", zIndex: 4 },
      { transform: "none", transformOrigin: "top left", zIndex: 4 },
    ], timing),
    card.animate([
      { transform: chartTransform, transformOrigin: "top left" },
      { transform: "none", transformOrigin: "top left" },
    ], timing),
    previewClose.animate([{ opacity: 0, pointerEvents: "none" }, { opacity: 1, pointerEvents: "auto" }], {
      delay: timing.duration, duration: 150, easing: "ease-out", fill: "backwards",
    }),
  ];
}

function closePreview() {
  if (!preview.open || preview.hasAttribute("data-closing")) return;
  const home = charts[previewIndex];
  const homeCard = home?.host.firstElementChild;
  const card = previewHost.firstElementChild;
  if (reducedMotion.matches || !home || !homeCard || !card) {
    preview.close();
    return;
  }

  // Capture the current motion before cancelling in case dismissal interrupts the opening.
  const stageStart = getComputedStyle(previewStage).transform || "none";
  const chartStart = getComputedStyle(card).transform || "none";
  const closeOpacity = getComputedStyle(previewClose).opacity || "1";
  previewAnimations.splice(0).forEach(animation => animation.cancel());
  const transforms = previewTransforms(home.card.getBoundingClientRect(), homeCard.getBoundingClientRect(), card);
  if (!transforms) {
    preview.close();
    return;
  }

  preview.setAttribute("data-closing", "");
  previewContent.inert = true;
  const timing = { duration: previewDuration, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" } as const;
  const animations = [
    previewStage.animate([
      { transform: stageStart, transformOrigin: "top left", zIndex: 4 },
      { transform: transforms.stageTransform, transformOrigin: "top left", zIndex: 4 },
    ], timing),
    card.animate([
      { transform: chartStart, transformOrigin: "top left" },
      { transform: transforms.chartTransform, transformOrigin: "top left" },
    ], timing),
    previewClose.animate([{ opacity: closeOpacity }, { opacity: 0 }], { duration: 150, fill: "forwards" }),
  ];
  previewAnimations = animations;
  void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
    if (preview.open && previewAnimations === animations) preview.close();
  });
}

preview.addEventListener("cancel", event => {
  event.preventDefault();
  closePreview();
});

preview.addEventListener("close", () => {
  if (preview.open || configuratorScroll) return;
  preview.removeAttribute("data-closing");
  previewContent.inert = false;
  closeCurrentMenu?.();
  clearDetail();
  previewIndex = -1;
});

editor.addEventListener("close", () => {
  if (editor.open || !configuratorScroll) return;
  const { modal, fields } = configuratorScroll;
  configuratorScroll = undefined;
  preview.showModal();
  detailWidth = 0;
  resizeDetail();
  preview.scrollTop = modal;
  previewFields.scrollTop = fields;
  updatePreviewFade();
  charts[previewIndex].codeButton.focus({ preventScroll: true });
});

function drawChart(index: number) {
  const chart = charts[index];
  chart.card.hidden = !matchesFilter(configs[index]);
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

function syncConfigurator() {
  const config = configs[previewIndex];
  const { title: _title, period: _period, theme, ...editable } = config;
  const { fontFamily: _fontFamily, ...colors } = theme ?? {};
  source.value = JSON.stringify({ ...editable, ...(Object.keys(colors).length ? { theme: colors } : {}) }, null, 2);
}

function update(config: ChartConfig) {
  const index = previewIndex;
  const typeChanged = config.type !== configs[index].type;
  configs[index] = config;
  if (typeChanged) selectedViews[index] = config.type === "strip" ? 0 : viewsFor(index).length - 1;
  drawChart(index);
  if (editor.open) syncConfigurator();
}

function applyControls() {
  const config = configs[previewIndex];
  if (config && "series" in config) {
    update({ ...config, grid: grid.checked, xAxis: { ...config.xAxis, show: xAxis.checked }, yAxis: { ...config.yAxis, show: yAxis.checked } });
  }
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

function saveSiteAppearance() {
  applySiteAppearance();
  try { localStorage.setItem(siteAppearanceKey, JSON.stringify(siteAppearance)); } catch { /* Storage may be unavailable. */ }
  storeChartAppearances();
}

siteThemeOptions.forEach(option => option.addEventListener("change", () => {
  const theme = chartThemes.find(value => value === option.value);
  if (!option.checked || !theme || theme === siteAppearance.theme) return;
  siteAppearance.theme = theme;
  appearances.forEach(appearance => { appearance.theme = undefined; });
  saveSiteAppearance();
}));

sitePalette.addEventListener("change", () => {
  const palette = chartPalettes.find(value => value === sitePalette.value);
  if (!palette || palette === siteAppearance.palette) return;
  siteAppearance.palette = palette;
  appearances.forEach((appearance, index) => {
    appearance.palette = undefined;
    useSchemeAccent(index);
  });
  saveSiteAppearance();
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
  if (index < 0 || !palette) return;
  appearances[index].palette = palette === siteAppearance.palette ? undefined : palette;
  saveChartAppearance(index);
  useSchemeAccent(index);
});
for (const dialog of [siteSettings, preview, editor]) {
  const dismiss = () => {
    if (dialog === preview) closePreview();
    else dialog.close();
  };
  const close = dialog.querySelector("[data-close]");
  if (!close?.hasChildNodes()) close?.append(icon("close"));
  close?.addEventListener("click", () => { closeCurrentMenu?.(); dismiss(); });
  dialog.addEventListener("close", () => { if (!dialog.open) closeCurrentMenu?.(); });
  dialog.addEventListener("click", event => {
    if (event.target === dialog || (dialog === preview && event.target === previewContent)) dismiss();
  });
}
[xAxis, yAxis, grid].forEach(control => onSegmentChange(control, applyControls));
onSegmentChange(gradientFill, () => {
  const config = configs[previewIndex];
  if (config?.type === "line" || config?.type === "line-column") update({ ...config, gradientFill: gradientFill.checked });
});
legendPosition.addEventListener("change", () => {
  const config = configs[previewIndex];
  if (config?.type === "strip") update({ ...config, legendPosition: legendPosition.value as LegendPosition });
});
onSegmentChange(showVolume, () => {
  const config = configs[previewIndex];
  if (config?.type === "line-column") update({ ...config, showVolume: showVolume.checked });
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
  const input: unknown = JSON.parse(text);
  if (!isRecord(input)) throw new Error("Enter a version 1 chart configuration.");
  const current = configs[previewIndex];
  const parsed = {
    ...input,
    title: current.title,
    period: current.period,
    theme: isRecord(input.theme) || input.theme === undefined
      ? { ...input.theme, fontFamily: current.theme?.fontFamily } : input.theme,
  } as Record<string, unknown>;
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
    if (parsed.type !== "column" && parsed.gradientFill !== undefined && typeof parsed.gradientFill !== "boolean") {
      throw new Error("Gradient fill must be true or false.");
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
    await navigator.clipboard.writeText(JSON.stringify(readConfig(source.value), null, 2));
    status.textContent = "Configuration copied.";
  } catch {
    source.focus();
    source.select();
    status.textContent = "Configuration selected. Use your device’s copy command.";
  }
});
byId("reset").addEventListener("click", () => {
  const current = configs[previewIndex];
  const preset = structuredClone(presets[previewIndex].config);
  update({ ...preset, title: current.title, theme: { ...preset.theme, fontFamily: current.theme?.fontFamily } });
  status.textContent = "Preset restored.";
});

// Fade the navigation as it crosses the viewport edge, in either scroll direction.
const chartNav = document.querySelector<HTMLElement>(".chart-nav")!;
let navFadeFrame = 0;
function updateNavFade() {
  navFadeFrame = 0;
  const { top, height } = chartNav.getBoundingClientRect();
  chartNav.style.opacity = String(Math.max(0, Math.min(1, (top + height) / height)));
}
window.addEventListener("scroll", () => {
  if (!navFadeFrame) navFadeFrame = requestAnimationFrame(updateNavFade);
}, { passive: true });
window.addEventListener("resize", updateNavFade);
updateNavFade();
