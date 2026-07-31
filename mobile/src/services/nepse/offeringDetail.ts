/**
 * Per-issue application statistics.
 *
 * ShareHub's `/public-offering` list endpoint carries no applicant or
 * subscription figures at all — those live only on the per-issue detail
 * endpoint. CDSC fills the gap while an issue is open; for everything else
 * (closed issues, past results) this is the only source.
 */
const DATA_BASE = 'https://sharehubnepal.com/data/api/v1';

export type OfferingDetailStats = {
  applicants: number | null;
  appliedUnits: number | null;
  appliedAmount: number | null;
  /** ShareHub's own subscription figure, e.g. 4420.81 means 44.21x. */
  appliedPercentage: number | null;
  /** ShareHub's own allotment probability, e.g. 2.43 (%). */
  allotmentPercentage: number | null;
  /** Parsed from "will be allotted with a minimum of 10 units". */
  minimumUnits: number | null;
};

const cache = new Map<string, OfferingDetailStats | null>();
const inflight = new Map<string, Promise<OfferingDetailStats | null>>();

// Cards fetch on mount, so a scroll burst can queue dozens of slugs at once.
const MAX_CONCURRENT = 4;
let active = 0;
const queue: (() => void)[] = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active -= 1;
  queue.shift()?.();
}

export function invalidateOfferingDetailCache(): void {
  cache.clear();
}

export function peekOfferingDetail(
  slug?: string | null,
): OfferingDetailStats | null | undefined {
  return slug ? cache.get(slug) : undefined;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "Only 65,570, out of 27,01,564 individuals will be allotted with a minimum of 10 units." */
function parseMinimumUnits(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const m = text.match(/minimum of\s+([\d,]+)\s+unit/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function loadOfferingDetail(
  slug: string,
): Promise<OfferingDetailStats | null> {
  if (cache.has(slug)) return cache.get(slug) ?? null;
  const pending = inflight.get(slug);
  if (pending) return pending;

  const task = (async () => {
    await acquire();
    try {
      const res = await fetch(
        `${DATA_BASE}/public-offering/${encodeURIComponent(slug)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as {
        data?: Record<string, unknown>;
      };
      const data = json.data;
      if (!data) return null;

      const stats: OfferingDetailStats = {
        applicants: num(data.totalApplicants),
        appliedUnits: num(data.totalAppliedUnits),
        appliedAmount: num(data.totalAppliedAmount),
        appliedPercentage: num(data.appliedPercentage),
        allotmentPercentage: num(data.allotmentProbabilityPercentage),
        minimumUnits: parseMinimumUnits(data.allocationProbabilityDetails),
      };
      cache.set(slug, stats);
      return stats;
    } catch {
      return null;
    } finally {
      release();
      inflight.delete(slug);
    }
  })();

  inflight.set(slug, task);
  return task;
}
