import type { ChartConfig, ChartOptions } from "../src/charts.js";

const range = (size: number, map: (i: number) => number) => Array.from({ length: size }, (_, i) => map(i));
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const date = (i: number) => new Date(Date.UTC(2024, 7, 19 + i));
export const formatDay = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format;
const labels = (size: number, resolution = 1) => Array.from({ length: size }, (_, i) =>
  formatDay(date(Math.floor(i / resolution)))
    + (resolution > 1 ? ` ${String((i % resolution) * 24 / resolution).padStart(2, "0")}:00` : ""));
const noise = (i: number) => ((i * 37 + i * i * 11) % 101) / 100;
const created = range(30, i => i < 6 ? [53, 58, 37, 65, 65, 25][i] : 12 + Math.round(noise(i) * 16));
const active = range(83, i => {
  const trend = 137_530 - Math.max(0, 81 - i) ** 1.5 * 114;
  const variation = (noise(i) - 0.5) * 5_400 + Math.sin(i * 0.43) * 2_100;
  return i === 82 ? 137_530 : Math.round(trend + variation);
});
const market = range(112, i => Math.round(7_510 + 53 * Math.sin(i / 7) + 47 * Math.sin(i / 3.7) - 24 * noise(i)) / 100);
const price = range(251, i => Math.round(2285 + 15 * Math.sin(i / 17) + 9 * Math.sin(i / 8) + 4 * noise(i)) / 1000);
const volume = range(251, i => Math.round((20 + 40 * noise(i) + 15 * (1 + Math.sin(i / 8))) * 1000));
const sales = [35_600, 26_000, 43_846, 16_600, 43_846, 43_200];
const contractItems = [
  { label: "Print book", value: 1_080_256 }, { label: "E-book", value: 933_837 },
  { label: "Audiobook", value: 765_447 }, { label: "Magazine", value: 287_942 },
  { label: "Newspaper", value: 136_566 }, { label: "Archive record", value: 113_147 },
  { label: "DVD", value: 60_271 }, { label: "Map", value: 39_765 },
  { label: "Other", value: 285_931 },
];
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0).toLocaleString("en");
const usd = (value: number, digits: number) => "$" + value.toFixed(digits);
const retailHeadline = new Intl.NumberFormat("en", {
  style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 3, maximumFractionDigits: 3,
}).format;

export const presets: { config: ChartConfig; layout?: "wide" | "calendar"; previousTitle: string; formatHeadline?: ChartOptions["formatHeadline"] }[] = [
  { previousTitle: "Accounts created", config: { version: 1, type: "column", title: "New library members", headline: sum(created), period: "30 days", height: 200, labels: labels(30), series: [{ name: "New members", values: created }], barStyle: "cap", barRadius: 2, yAxis: { show: false }, grid: false } },
  { previousTitle: "Market cap", formatHeadline: retailHeadline, config: { version: 1, type: "line", title: "Retail revenue", headline: retailHeadline(market[111] * 1e8), period: "1 month", height: 200, labels: labels(112, 4), series: [{ name: "Revenue", values: market.map(x => x * 1e8) }], yAxis: { format: "compact" }, marker: true } },
  { previousTitle: "Amount of sales", config: { version: 1, type: "column", title: "Gallery ticket sales", headline: sum(sales), period: "Jan – Jun", height: 200, labels: months, series: [{ name: "Sales", values: sales }], barRadius: 8, yAxis: { show: false } } },
  { previousTitle: "Active accounts", config: { version: 1, type: "column", title: "Active subscribers", headline: active[82].toLocaleString("en"), period: "1 month", height: 200, labels: labels(83, 3), series: [{ name: "Subscribers", values: active }], yAxis: { format: "compact" }, barWidth: 4 } },
  { layout: "calendar", previousTitle: "Transactions", config: { version: 1, type: "heatmap", title: "Daily museum visits", period: "1 year", days: Array.from({ length: 365 }, (_, i) => ({ date: date(i).toISOString().slice(0, 10), value: i % 7 > 0 && i % 7 < 6 ? Math.floor(noise(i) * (i % 28 < 13 ? 20 : 4)) : 0 })) } },
  { layout: "wide", previousTitle: "Price and volume", config: { version: 1, type: "line-column", title: "Coffee price and volume", headline: usd(price[250], 3), period: "1 month", height: 256, labels: labels(251, 8), series: [{ name: "Price", values: price }, { name: "Volume", values: volume }], yAxis: { format: "currency", digits: 3 }, marker: true, showVolume: true } },
  { previousTitle: "Contract types", config: { version: 1, type: "strip", title: "Library collection mix", period: "By item count", height: 232, items: contractItems, selected: 3, legendPosition: "below" } },
  { layout: "wide", previousTitle: "Transaction count", config: { version: 1, type: "column", title: "Transit boardings", period: "24 hours", height: 264, labels: labels(168, 24), series: [{ name: "Bus", values: range(168, i => Math.round(20_000 + 38_000 * noise(i) + 35_000 * Math.max(0, Math.sin(i * 0.26)))) }, { name: "Rail", values: range(168, i => Math.round(14_000 + 36_000 * noise(i + 23) + 30_000 * Math.max(0, Math.sin(i * 0.23 + 1)))) }], yAxis: { format: "compact" }, stacked: true, barWidth: 4, barRadius: 2 } },
  { previousTitle: "Validators per election", config: { version: 1, type: "column", title: "Support requests per shift", period: "1 week", height: 264, labels: labels(40, 6), series: [{ name: "Requests", values: range(40, i => 175 + Math.floor(noise(i) * 182)) }], barStyle: "cap", barRadius: 2 } },
  { previousTitle: "Hourly temperature range", config: { version: 1, type: "range-column", title: "Temperature range", period: "24 hours", height: 264, labels: Array.from({ length: 168 }, (_, i) => `${formatDay(date(Math.floor(i / 24)))} ${String(i % 24).padStart(2, "0")}:00`), ranges: Array.from({ length: 168 }, (_, i) => { const center = 9 + Math.round(noise(i * 7 + 11) * 14) + Math.round(noise(Math.floor(i / 24) * 13 + 8) * 10) - 5; return { low: center - 1 - Math.floor(noise(i * 3 + 17) * 8), high: center + 1 + Math.floor(noise(i * 5 + 71) * 8) }; }), xAxis: { ticks: 6 }, yAxis: { show: false }, grid: false, showTracks: true } },
  { previousTitle: "Museum ticket types", config: { version: 1, type: "donut", title: "Museum visits by ticket type", height: 232, legendPosition: "below", selected: 0, items: [
    { label: "Adult", value: 5400 }, { label: "Concession", value: 2700 }, { label: "Child", value: 1900 }, { label: "Member", value: 800 },
  ] } },
  { previousTitle: "Loading state", config: { version: 1, type: "column", title: "Loading state", height: 200, labels: [], series: [{ name: "Values", values: [] }] } },
  { previousTitle: "Error state", config: { version: 1, type: "column", title: "Error state", height: 200, labels: [], series: [{ name: "Values", values: [] }] } },
  { previousTitle: "Tickets reserved", config: { version: 1, type: "strip", title: "Ticket reservations", segmented: true, capacity: 1_000, segmentCount: 120, height: 40, legendPosition: "below", items: [
    { label: "Adult", value: 320, color: "var(--viz-palette-purple, #8052ca)" },
    { label: "Concession", value: 210, color: "var(--viz-palette-orange, #e95f1c)" },
    { label: "Child", value: 140, color: "var(--viz-palette-green, #009b68)" },
    { label: "Member", value: 90, color: "var(--viz-palette-blue, #4977e1)" },
  ] } },
];
