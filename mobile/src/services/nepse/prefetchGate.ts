/**
 * Pause background warm-up while the user is navigating / scrolling so taps
 * and transitions aren't fighting floorsheet / screener CPU on the JS thread.
 */

let pausedUntil = 0;
let generation = 0;

/** Block prefetch for `ms` (default 4s). Safe to call from press handlers. */
export function pausePrefetch(ms = 4000): void {
  const until = Date.now() + Math.max(0, ms);
  if (until > pausedUntil) pausedUntil = until;
  generation += 1;
}

export function isPrefetchPaused(): boolean {
  return Date.now() < pausedUntil;
}

/** Wait until the gate opens (or timeout). */
export async function waitIfPrefetchPaused(
  maxWaitMs = 8000,
): Promise<void> {
  const start = Date.now();
  while (isPrefetchPaused() && Date.now() - start < maxWaitMs) {
    await new Promise<void>((r) => setTimeout(r, 120));
  }
}

export function prefetchGeneration(): number {
  return generation;
}
