# Viz Charts

A framework-independent TypeScript chart package with an SVG/HTML renderer and a web gallery of editable reference presets.

## Run the gallery

```sh
npm ci
npm run dev
```

Use **Customize** to select a preset, edit the visible controls or JSON, and copy the configuration. Use the left and right arrow keys on a focused plot to inspect individual values. **View data** opens an accessible table. Data shown in the gallery is synthetic.

## Use the chart API

The compiled package exposes `mountChart` and `chartLayout` as JavaScript ES modules. Import the stylesheet alongside the package.

```ts
import { mountChart } from "viz-charts";
import "viz-charts/style.css";

const host = document.querySelector<HTMLElement>("#chart")!;
const chart = mountChart(host, {
  version: 1,
  type: "column",
  title: "Monthly orders",
  labels: ["Jan", "Feb", "Mar"],
  series: [{ name: "Orders", values: [110, 95, 132] }],
  barRadius: 8,
  yAxis: { min: 0, ticks: 4 },
  theme: { accent: "#4977E1" },
});
```

Call `chart.update(config)` to replace the configuration and `chart.destroy()` to remove the chart and stop observing its container. An optional `formatValue` hook supplies a custom value formatter. Run `npm run build` to build the package into `lib/` and the static gallery into `dist/`.

The preview includes column, stacked column, line, line plus aligned columns, calendar heatmap, and proportional strip charts.

## GitHub Pages

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, then run **Publish gallery** manually or push to `main`.
