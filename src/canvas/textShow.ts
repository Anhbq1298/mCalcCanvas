/** A text with props.showWhen has one hidden engine region holding its condition (see engineBridge). */
export const textShowRegionId = (shapeId: string) => `${shapeId}#show`;

/** Shown unless the condition evaluates to a failed check or to 0; an error or no result yet shows the text. */
export function conditionHolds(r: { status?: string; check?: { pass: boolean } | null; value?: { number?: number } | null } | undefined): boolean {
  if (!r || r.status !== 'valid') return true;
  if (r.check) return r.check.pass;
  return (r.value?.number ?? 1) !== 0;
}
