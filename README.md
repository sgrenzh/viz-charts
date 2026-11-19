# Viz Charts

[Open the live preview](https://sgrenzh.github.io/viz-charts/)

Viz Charts is a framework-independent TypeScript library for responsive SVG charts. It includes columns and stacked columns, lines, combined line and column charts, calendar heatmaps, proportional strips, and donut charts. Configure data, axes, and styling in code, or use the chart settings in the live gallery and copy the resulting JSON. The gallery uses synthetic data.

## Run locally

Requires Node.js 24 and npm.

```sh
git clone https://github.com/sgrenzh/viz-charts.git
cd viz-charts
npm ci
npm run dev
```

Open the local URL printed by Vite. Filter by chart type, or use the settings button on the right to set the theme and color scheme across the site. On each card, use the settings button to open the preview. In the preview, you can change the chart’s appearance and edit or copy its configuration.

## Use in a web app

Run `npm run build` and `npm pack` from this repository. In your app, install the resulting tarball with `npm install /path/to/viz-charts-0.1.0.tgz`.

Add a container such as `<div id="chart"></div>` to your page, then mount a chart from your app’s JavaScript or TypeScript entry point.

```js
import { mountChart } from "viz-charts";
import "viz-charts/style.css";

const chart = mountChart(document.getElementById("chart"), {
  version: 1,
  type: "column",
  title: "Monthly orders",
  labels: ["Jan", "Feb", "Mar"],
  series: [{ name: "Orders", values: [110, 95, 132] }],
  yAxis: { min: 0, ticks: 4 },
  theme: { accent: "#4977E1" },
});
```

Call `chart.update(config)` when your data or settings change and `chart.destroy()` when you remove the chart.

To explore a chart with a keyboard, focus its plot and use the arrow keys, Home or End. Press Escape or click outside the chart to dismiss its tooltip. Touch users can tap a mark to inspect it and tap it again or elsewhere to dismiss it. Strip and donut charts also let users select an item with Enter or Space; progress bars show details without changing selection.

Range column charts display a low-to-high interval for each label. They can use values from any data source; update the chart when new values arrive:

```js
const config = {
  version: 1,
  type: "range-column",
  title: "Temperature range",
  labels: ["09:00", "10:00", "11:00"],
  ranges: [{ low: 12, high: 15 }, { low: 13, high: 17 }, { low: 14, high: 18 }],
  showTracks: true,
  xAxis: { show: true },
  yAxis: { show: false },
  grid: false,
};
const chart = mountChart(document.getElementById("chart"), config);
// When new data arrives: chart.update({ ...config, labels, ranges });
```

Each range must have numeric `low` and `high` values in ascending order, or be `null` for a missing observation. Source connections, polling and loading states belong to the embedding application.

For a line or combined line and column chart, set `gradientFill: true` to fade the lead line’s color toward the base of the line plot. In the gallery, open the chart’s preview and set **Gradient fill** to **On**.

The chart stylesheet loads [Allo](https://allo.joshpuckett.me/) by default and shares a type scale with the gallery. Set `theme.fontFamily` to use your own font on a chart. Allo ships under the [SIL Open Font License](public/licenses/allo.txt).

## Progress bar

Set `segmented: true` on a strip chart to show item values against a capacity. The chart displays the current total and capacity above the segments; the unfilled segments represent remaining capacity. `height` controls segment height, `segmentCount` controls density, and `legend` shows or hides the key. Each item can provide its own `color`.

```js
mountChart(document.getElementById("chart"), {
  version: 1, type: "strip", title: "Ticket reservations", segmented: true,
  capacity: 1000, height: 40, segmentCount: 120, legend: true,
  items: [{ label: "Adult", value: 320 }, { label: "Concession", value: 210 }],
});
```

Capacity must be at least the sum of the item values. Segment counts adapt to narrower containers, so the display is an approximation; the displayed totals and tooltips use the exact values.

## Donut charts

Donut charts show each item's share of the total. Select a segment or a key entry to update the centre percentage. The key can be placed below, left or right, or hidden. Configure the centre value, ring thickness and spacing in the gallery, or in code:

```js
mountChart(document.getElementById("chart"), {
  version: 1, type: "donut", title: "Visits by ticket type",
  items: [{ label: "Adult", value: 5400 }, { label: "Child", value: 1900 }],
  selected: 0, legend: true, legendPosition: "below",
  showCenter: true, ringWidth: 0.075, gap: 2,
});
```

`ringWidth` is a fraction of the donut diameter; `gap` is the approximate spacing in pixels. Each item may specify a CSS `color`.
