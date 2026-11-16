# Viz Charts

[Open the live preview](https://sgrenzh.github.io/viz-charts/)

Viz Charts is a framework-independent TypeScript library for responsive SVG charts. It includes columns and stacked columns, lines, combined line and column charts, calendar heatmaps, and proportional strips. Configure data, axes, and styling in code, or use the chart settings in the live gallery and copy the resulting JSON. The gallery uses synthetic data.

## Run locally

Requires Node.js 24 and npm.

```sh
git clone https://github.com/sgrenzh/viz-charts.git
cd viz-charts
npm ci
npm run dev
```

Open the local URL printed by Vite. Select **Customize** to change the gallery theme or accent. Use the gear on a chart to edit its settings and copy its configuration, or the table icon to inspect the plotted data.

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
