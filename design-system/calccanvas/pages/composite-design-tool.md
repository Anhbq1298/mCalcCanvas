# Page override: mCompositeBeamDesign (composite/index.html)

Same look as MBColumnLite (github.com/Anhbq1298/MBColumnLite), set entirely in Roboto (self-hosted, @fontsource/roboto).

- **Layout:** title block (name, scope, status with amber busy dot, Reset / .mCCV / Open full report);
  workspace of three columns separated by hairline rules: inputs | drawing sheet | check (verdict);
  a bottom row with the section-property and shear-connection tables.
- **Middle column holds every diagram:** CAD-style UDL and point-load sketches (hairline geometry, pin and roller with
  hatched ground, arrow arrays, chained dimensions with 45° ticks; G layer steel blue, Q layer red),
  internal forces, plastic stress block, deflection.
- **Palette:** paper #E9EDEB, sheet #F6F8F7, ink #1F2A30, ink-2 #56636A, rule #C3CBC8, steel #2B3A8C, amber #D99A0F,
  pass #2E7A4E, fail #B8322A. No cards or shadows.
- **Verdict:** governing UR as a 40 px ratio, PASS/FAIL tag, design basis, permanent UR; check table with clause under
  each name; governing row bold with an amber inset bar.
- **Inputs:** label above field in a two-column grid, amber dot on changed values; load tables with transparent
  cells (MBColumnLite tables), G/Q case select; "Error: …" under a field after an invalid entry.
- **Behaviour:** calculation in a worker; charts drawn at their pixel width with a crosshair (hover or ← →);
  rem sizes with `<meta name="text-scale">`; 44 px targets on touch.
