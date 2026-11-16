import { mountChart, type ChartConfig } from "./charts.js";
import { presets } from "./presets.js";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const gallery = byId("gallery");
const editor = byId("editor");
const edit = byId<HTMLButtonElement>("edit");
const select = byId<HTMLSelectElement>("presets");
const title = byId<HTMLInputElement>("title");
const accent = byId<HTMLInputElement>("accent");
const font = byId<HTMLInputElement>("font");
const xAxis = byId<HTMLInputElement>("axis-x");
const yAxis = byId<HTMLInputElement>("axis-y");
const grid = byId<HTMLInputElement>("grid");
const source = byId<HTMLTextAreaElement>("config");
const status = byId("status");

const configs = presets.map(({ config }) => structuredClone(config));
const charts = presets.map(({ config, span }, i) => {
  const host = document.createElement("div");
  host.style.setProperty("--span", String(span));
  gallery.append(host);
  const option = document.createElement("option");
  option.textContent = config.title;
  option.value = String(i);
  select.append(option);
  return { host, ...mountChart(host, configs[i]) };
});
let chosen = 0;

function sync() {
  const config = configs[chosen];
  title.value = config.title;
  accent.value = /^#[0-9a-f]{6}$/i.test(config.theme?.accent ?? "") ? config.theme!.accent! : "#4977e1";
  font.value = config.theme?.fontFamily ?? "";
  const hasAxes = "series" in config;
  xAxis.disabled = yAxis.disabled = grid.disabled = !hasAxes;
  xAxis.checked = hasAxes && config.xAxis?.show !== false;
  yAxis.checked = hasAxes && config.yAxis?.show !== false;
  grid.checked = hasAxes && config.grid !== false;
  source.value = JSON.stringify(config, null, 2);
  Array.from(select.options).forEach((option, i) => { option.text = configs[i].title; });
  charts.forEach(({ host }, i) => { host.toggleAttribute("data-selected", !editor.hidden && i === chosen); });
}

function update(config: ChartConfig) {
  charts[chosen].update(config);
  configs[chosen] = config;
  sync();
}

function applyControls() {
  let config = configs[chosen];
  config = {
    ...config,
    title: title.value.trim() || presets[chosen].config.title,
    theme: { ...config.theme, accent: accent.value, fontFamily: font.value.trim() || undefined },
  };
  if ("series" in config) {
    config = { ...config, grid: grid.checked, xAxis: { ...config.xAxis, show: xAxis.checked }, yAxis: { ...config.yAxis, show: yAxis.checked } };
  }
  update(config);
}

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

edit.addEventListener("click", () => {
  editor.hidden = !editor.hidden;
  edit.setAttribute("aria-expanded", String(!editor.hidden));
  sync();
  if (!editor.hidden) select.focus();
});
select.addEventListener("change", () => { chosen = Number(select.value); status.textContent = ""; sync(); });
[title, accent, font, xAxis, yAxis, grid].forEach(control => control.addEventListener("change", applyControls));
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
sync();
