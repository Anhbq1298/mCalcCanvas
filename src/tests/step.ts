/**
 * One named check inside a larger test (tests are grouped per behaviour to keep
 * the suite small). A failure is reported with the step name.
 */
export function step(name: string, fn: () => void): void;
export function step(name: string, fn: () => Promise<void>): Promise<void>;
export function step(name: string, fn: () => void | Promise<void>): void | Promise<void> {
  const tag = (e: unknown) => {
    if (e instanceof Error) e.message = `[${name}] ${e.message}`;
    return e;
  };
  try {
    const r = fn();
    if (r instanceof Promise) return r.catch((e) => Promise.reject(tag(e)));
  } catch (e) {
    throw tag(e);
  }
}
