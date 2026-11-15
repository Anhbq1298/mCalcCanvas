/** Colours (MBColumnLite drawing palette) and number format shared by the mCompositeBeamDesign page. */
export const C = { navy: '#2B3A8C', blue: '#2B3A8C', red: '#B8322A', green: '#2E7A4E', amber: '#D99A0F', grey: '#56636A', ink: '#1F2A30', muted: '#56636A', concrete: '#C8CBC3', rule: '#C3CBC8', sheet: '#F6F8F7', q: '#B8322A' };
export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
