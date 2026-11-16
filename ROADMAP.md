# Charts package roadmap

Approved on 16 November 2026.

## First web release

Build a responsive chart package for designers and developers, with a typed code API and a live configurator. The public GitHub Pages gallery will show the reference designs as editable presets and let users copy the resulting configuration. Use simple synthetic datasets with consistent marks, values, totals, and tooltips.

| Chart family | Reference presets and release scope |
| --- | --- |
| Column | Accounts created, Active accounts, Validators per election, Amount of sales, and Transaction count. Transaction count uses stacked columns. |
| Line | Market cap. |
| Line + aligned columns | Price and volume, with a shared time axis and independent value scales. |
| Calendar heatmap | Transactions, with a date-driven calendar grid and configurable color thresholds. |
| Proportional strip | Contract types and Contract interfaces as presets of the same chart family. |
| Interval timeline | Phases and milestones across lanes. Include in the first release if the SVG or Figma frame becomes available. The overview PNG is the current reference. |

The directional transfer diagram is deferred. Native mobile and agent-chat integrations are future work. The web package and gallery support mobile browsers from the first release.

## Design and customization

- Use the supplied SVGs to establish the visual proportions, mark shapes, and color palette. Normalize layout and geometry to a 4 px grid, using 2 px increments where needed to preserve the design. Set the reference heatmap cells to 24 × 24 px with 4 px corner radii.
- Use Noto Sans from Google Fonts. Expose typography, colors, spacing, and related brand settings as theme tokens.
- Share the configuration between the code API and the editor. Expose data, axes, tick labels and formatting, legends, tooltips, sizing, and chart-specific view options where applicable. Export a versioned JSON configuration and support JavaScript hooks for application-specific formatting.
- Review mobile behavior per chart. Check labels, touch targets, keyboard navigation, and a text or tabular path to the data. Use shorter windows for dense date grids when needed, keep shared axes aligned, and move the proportional strip legend below the chart in narrow containers.

## Stack

Use framework-independent TypeScript compiled to JavaScript ES modules, small D3 modules for scales and shapes, SVG/HTML rendering, and CSS variables for theming. Keep data normalization, chart layout, and rendering separate. This gives future renderers and chat integrations a common configuration and data model. Start with the simplest renderer that matches the design. Measure real workloads before adding Canvas or other optimizations.

## Delivery

- **Repository.** Create the GitHub repository for the package and gallery.
- **First push.** Implement the chart presets, the shared configuration API, and the live editor. Push the initial implementation and deploy the gallery to public GitHub Pages using Vite and GitHub Actions.
- **Chart review.** Inspect each preset against the artwork at its reference size and across narrow and wide containers. Tune normalized geometry, typography, hover, focus, and touch behavior. Review the gallery chart by chart.
- **First release.** Apply review feedback, verify the public gallery and configuration export, and tag the first version.
