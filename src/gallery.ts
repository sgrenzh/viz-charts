import { mountChart, type ChartConfig } from "./charts.js";
import { presets } from "./presets.js";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const gallery = byId("gallery");
const appearance = byId<HTMLDialogElement>("appearance");
const editor = byId<HTMLDialogElement>("editor");
const dataDialog = byId<HTMLDialogElement>("data-dialog");
const title = byId<HTMLInputElement>("title");
const accent = byId<HTMLInputElement>("accent");
const inheritAccent = byId<HTMLInputElement>("inherit-accent");
const pagePalette = byId<HTMLSelectElement>("page-palette");
const pageTheme = byId<HTMLSelectElement>("page-theme");
const font = byId<HTMLInputElement>("font");
const xAxis = byId<HTMLInputElement>("axis-x");
const yAxis = byId<HTMLInputElement>("axis-y");
const grid = byId<HTMLInputElement>("grid");
const source = byId<HTMLTextAreaElement>("config");
const status = byId("status");

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
  [{ label: "24 hours", count: 1 }, { label: "One week" }], [],
];
const samplesPerDay = [1, 4, 1, 3, 1, 8, 1, 24, 6, 1];
const stripViews: View[] = [{ label: "By address count" }, { label: "By category" }];
const configs = presets.map(({ config }) => structuredClone(config));
const selectedViews = presets.map(({ config }, index) => config.type === "strip" ? 0 : viewsByPreset[index].length - 1);
let chosen = 0;
let closeCurrentMenu: (() => void) | undefined;

const icons = {
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
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
  toolbar.append(range, settings, data);

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
  return { toolbar, refresh };
}

const charts = presets.map(({ span }, index) => {
  const host = document.createElement("div");
  host.style.setProperty("--span", String(span));
  gallery.append(host);
  const { toolbar, refresh } = createToolbar(index);
  return { refresh, ...mountChart(host, viewConfig(index), { controls: toolbar }) };
});

function drawChart(index: number) {
  charts[index].refresh();
  charts[index].update(viewConfig(index));
}

function sync() {
  const config = configs[chosen];
  byId("chart-name").textContent = config.title;
  title.value = config.title;
  const ownAccent = config.theme?.accent;
  inheritAccent.checked = ownAccent === undefined;
  accent.disabled = inheritAccent.checked;
  const galleryAccent = getComputedStyle(document.documentElement).getPropertyValue("--viz-page-accent").trim();
  accent.value = /^#[0-9a-f]{6}$/i.test(ownAccent ?? "") ? ownAccent! : galleryAccent;
  font.value = config.theme?.fontFamily ?? "";
  const hasAxes = "series" in config;
  byId("axes").hidden = !hasAxes;
  xAxis.checked = hasAxes && config.xAxis?.show !== false;
  yAxis.checked = hasAxes && config.yAxis?.show !== false;
  grid.checked = hasAxes && config.grid !== false;
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
  const dark = pageTheme.value === "dark" || (pageTheme.value === "system" && themeQuery.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.palette = pagePalette.value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#18171c" : "#f2f2f2");
  try { localStorage.setItem("viz-gallery-appearance", JSON.stringify({ theme: pageTheme.value, palette: pagePalette.value })); } catch { /* Storage may be disabled. */ }
}
try {
  const saved = JSON.parse(localStorage.getItem("viz-gallery-appearance") ?? "{}");
  if (["light", "dark", "system"].includes(saved?.theme)) pageTheme.value = saved.theme;
  if (Array.from(pagePalette.options).some(option => option.value === saved?.palette)) pagePalette.value = saved.palette;
} catch { /* Use the defaults when settings are unavailable. */ }
applyAppearance();
themeQuery.addEventListener("change", applyAppearance);
pageTheme.addEventListener("change", applyAppearance);
pagePalette.addEventListener("change", applyAppearance);
byId("edit").addEventListener("click", () => { closeCurrentMenu?.(); appearance.showModal(); });
for (const dialog of [appearance, editor, dataDialog]) {
  dialog.querySelector("[data-close]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
}
[title, accent, inheritAccent, font, xAxis, yAxis, grid].forEach(control => control.addEventListener("change", applyControls));

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
  } else if (parsed.type === "column" || parsed.type === "line" || parsed.type === "line-column") {
    const labels = parsed.labels;
    if (!Array.isArray(labels) || !labels.every(x => typeof x === "string") || !Array.isArray(parsed.series)
      || !parsed.series.every(s => isRecord(s) && typeof s.name === "string" && Array.isArray(s.values) && s.values.length === labels.length
        && s.values.every(v => v === null || finite(v)) && optionalText(s.color))
      || (parsed.type === "line-column" && parsed.series.length !== 2)) throw new Error("Provide labels and matching series values. Combo charts need two series.");
    if (!validAxis(parsed.xAxis) || !validAxis(parsed.yAxis) || !within(parsed.barRadius, 0, 40) || !within(parsed.barWidth, 1, 160)) {
      throw new Error("Check the axis and bar settings.");
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
