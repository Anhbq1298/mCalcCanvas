# Validation report — 14 November 2026

## Completed

- Generator writes native `.mCCV` deterministically using the shared EC3 layout helpers.
- Shared layout planner reports no oversized blocks using provisional region metrics.
- Independent Python reference checks the section forces, connector resistance, connection
  degree, two bending-resistance methods, LTB, transformed stiffness and staged deflection.
- Unit test evaluates every active equation with the existing engine and checks dimensions.
- All eleven figures consist of native editable objects; no image extension was required.
- Typecheck, lint and production build pass.
- Full unit suite passes: 32 files, 81 tests.

## Blocked

The template measurement/PDF command and Playwright e2e both stop at Chromium launch:

```text
FATAL:chrome/browser/process_singleton_posix.cc:297
socket() failed: Operation not permitted (1)
```

E2E was stopped after the first launch failure (`--max-failures=1`); 72 tests did not run.
No application PDF was produced. No browser screenshot or all-page visual inspection
was completed. No substitute PDF is labelled as an actual mCalcCanvas export.

## Outstanding engineering approval

Singapore National Annex factors and load combinations; local connector splitting and
anchorage; SLS shrinkage history/cracking and slip-model acceptance; general PNA branch
solver and numerical fixtures; current library binding. See `TECHNICAL.md` for exact scope.

The reference deliberately preserves failed LTB and transverse reinforcement checks.
