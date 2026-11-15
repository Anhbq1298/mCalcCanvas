# Page override: mCompositeBeamDesign (composite/index.html)

Overrides MASTER.md for the design-tool page (UI/UX Pro Max, `--design-system --density 8 --variance 3 --motion 2`).

- **Style:** Minimalism & Swiss, dense dashboard: 8–32 px spacing, cards on #F8FAFC, one primary action
  (Open full report) and one secondary (Download .mCCV).
- **Palette:** MASTER navy (#1E3A5F primary, #2563EB secondary). Utilisation colours: ≤ 0.9 emerald-700,
  0.9–1.0 amber-700, > 1.0 red-700, always with the number (never colour alone).
- **Type:** Inter; sizes in rem (follows the OS text scale via `<meta name="text-scale">`); figures tabular.
- **Inputs:** worksheet convention, light-yellow fill with blue figures; labels visible (symbol + description);
  validated after interaction with an inline "Error: …" message linked by aria-describedby only while shown.
- **Feedback:** the calculation runs in a worker; "Calculating…" and dimmed results while it runs; verdict in one
  polite live region.
- **Charts:** white background, no gridlines beyond faint y ticks, sagging moment and deflection drawn downwards,
  legend under the chart, limit as a dashed red line, each chart with an aria-label stating its key value.
- **Touch:** 44 px targets under `pointer: coarse`; visible focus ring (2 px #2563EB).
