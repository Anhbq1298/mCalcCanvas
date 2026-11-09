# Input & Results Workspace Overrides

> **PROJECT:** CalcCanvas
> **Generated:** 2026-11-09 13:35:12
> **Page Type:** Dense engineering batch calculation table

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- Use a full-height workspace beneath the existing document header.
- Keep one compact action strip above the grid; the grid owns the remaining height.
- Separate editable Inputs and read-only Results with group headers and a strong vertical divider.
- Use `table-layout: auto`, content-aware `width: 1%` numeric columns, and bounded min/max widths. Never distribute columns evenly.
- Keep the Case column sticky; allow horizontal scrolling for wide batches.

### Spacing Overrides

- Density 9/10: 36px data rows, 28px group header, 42px column header, 6px horizontal cell padding.
- Numeric columns: 104px minimum, 168px maximum. Case and status columns: 104px minimum.

### Typography Overrides

- Keep Inter from the Master system.
- Use 12px table values, 11px group/status labels, tabular numerals, and right-aligned numbers.

### Color Overrides

- Inputs use a very light blue surface; Results use neutral grey.
- Show PASS/FAIL with text and icon in addition to semantic colour.
- Outdated results use muted text plus a subtle hatch, not colour alone.

### Component Overrides

- Cells contain numbers only; units appear once below each column label.
- Inputs use compact native text inputs with visible hover/focus boundaries.
- Results are read-only cells and never resemble editable inputs.
- `Calculate All` is the only batch recalculation trigger.
- Column configuration uses two explicit fieldsets: Inputs and Outputs.

---

## Page-Specific Components

- Workspace tabs: Calculation / Input & Results.
- Column picker with inherited units and editable display labels.
- Dense batch grid with status column and source links.
- Not calculated / Outdated / Current / Error states.

---

## Recommendations

- Preserve grid semantics and keyboard focus order.
- Keep all source links operable by keyboard; do not rely on hover-only actions.
- Validate numeric cells on commit, then keep results stale until Calculate All.
- For small screens retain the table structure and use an explicit horizontal scroll region.
