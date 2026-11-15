/** Colours and number format shared by the mCompositeBeamDesign page. */
export const C = { navy: '#1e3a5f', blue: '#1d4ed8', red: '#b91c1c', green: '#059669', amber: '#b45309', grey: '#94a3b8', ink: '#0f172a', muted: '#475569', concrete: '#cbd5e1' };
export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
