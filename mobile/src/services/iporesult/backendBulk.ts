import type { AccountMeta } from '../../types/account';
import { maskBoid } from '../../utils/boid';
import { resolveBoidsForAccounts } from '../../utils/resolveBoid';
import {
  CDSC_BACKEND_URL,
  cdscBackendHeaders,
  isCdscBackendConfigured,
} from '../issuemanager/backendConfig';
import { formatAllotmentMessage } from '../issuemanager/bulkEngine';
import { imFetch } from '../issuemanager/http';
import type { PublicBulkResultRow, PublicBulkResultSummary } from './bulkEngine';

/**
 * Server-side CDSC bulk check.
 *
 * The VPS holds one warm Playwright session (stealth UA + CDSC_PROXY) that has
 * already passed the F5 WAF challenge, and solves captchas with the ONNX model
 * (2Captcha as fallback). Sending BOIDs there avoids the phone WebView entirely,
 * which is what CDSC's WAF blocks after a handful of in-app submissions.
 */
const BATCH_SIZE = 5;
/** Server runs BOIDs 2-at-a-time, so a batch can legitimately take a while. */
const BATCH_TIMEOUT_MS = 200_000;
/** Keeps us well under the backend's 30 requests/minute limiter. */
const BATCH_GAP_MS = 1200;

type BackendCheckRow = {
  boid: string;
  ok: boolean;
  allotted: boolean;
  quantity?: number | null;
  message: string;
  cached?: boolean;
};

/** Thrown only before any account is reported, so callers can fall back. */
export class CdscBackendUnavailableError extends Error {}

export function canUseCdscBackendBulk(): boolean {
  return isCdscBackendConfigured();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backendDetail(json: unknown, fallback: string): string {
  const detail = (json as { detail?: string } | null)?.detail;
  return typeof detail === 'string' && detail.trim() ? detail.trim() : fallback;
}

async function checkBatch(
  companyShareId: number | string,
  boids: string[],
): Promise<Map<string, BackendCheckRow>> {
  const res = await imFetch(`${CDSC_BACKEND_URL}/cdsc/check`, {
    method: 'POST',
    headers: await cdscBackendHeaders(),
    credentials: 'omit',
    timeoutMs: BATCH_TIMEOUT_MS,
    body: JSON.stringify({ companyShareId, boids }),
  });

  if (res.status !== 200 || !res.json) {
    throw new Error(
      backendDetail(res.json, `CDSC server check failed (HTTP ${res.status})`),
    );
  }

  const rows = (res.json as { results?: BackendCheckRow[] }).results ?? [];
  const byBoid = new Map<string, BackendCheckRow>();
  for (const row of rows) {
    if (row?.boid) byBoid.set(row.boid, row);
  }
  return byBoid;
}

export async function runCdscBackendBulkCheck(opts: {
  accounts: AccountMeta[];
  companyShareId: number | string;
  companyName: string;
  onProgress?: (msg: string, index: number, total: number) => void;
  onAccountStart?: (accountId: string, index: number, total: number) => void;
  onAccountResult?: (
    row: PublicBulkResultRow,
    index: number,
    total: number,
  ) => void;
}): Promise<PublicBulkResultSummary> {
  if (!isCdscBackendConfigured()) {
    throw new CdscBackendUnavailableError('CDSC server is not configured');
  }

  const resolved = await resolveBoidsForAccounts(opts.accounts);
  const total = resolved.length;
  const results: PublicBulkResultRow[] = [];
  let emitted = 0;

  const emit = (row: PublicBulkResultRow, index: number) => {
    results.push(row);
    emitted += 1;
    opts.onAccountResult?.(row, index, total);
  };

  const pending: Array<{ index: number; boid: string; masked: string }> = [];

  resolved.forEach((row, index) => {
    if (!row.boid) {
      emit(
        {
          accountId: row.account.id,
          accountName: row.account.name,
          username: row.account.username,
          ok: false,
          allotted: false,
          message: row.error ?? 'Missing BOID',
        },
        index,
      );
      return;
    }
    pending.push({ index, boid: row.boid, masked: maskBoid(row.boid) });
  });

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE);
    const first = batch[0];

    for (const item of batch) {
      opts.onAccountStart?.(resolved[item.index].account.id, item.index, total);
    }
    opts.onProgress?.(
      `Checking ${Math.min(start + batch.length, pending.length)}/${pending.length}…`,
      first.index,
      total,
    );

    let byBoid: Map<string, BackendCheckRow>;
    try {
      byBoid = await checkBatch(
        opts.companyShareId,
        batch.map((item) => item.boid),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'CDSC server check failed';
      // Nothing reported yet — let the caller try the on-phone WebView instead.
      if (emitted === 0) {
        throw new CdscBackendUnavailableError(message);
      }
      for (const item of batch) {
        const account = resolved[item.index].account;
        emit(
          {
            accountId: account.id,
            accountName: account.name,
            username: account.username,
            boidMasked: item.masked,
            ok: false,
            allotted: false,
            message,
          },
          item.index,
        );
      }
      continue;
    }

    for (const item of batch) {
      const account = resolved[item.index].account;
      const row = byBoid.get(item.boid);
      if (!row) {
        emit(
          {
            accountId: account.id,
            accountName: account.name,
            username: account.username,
            boidMasked: item.masked,
            ok: false,
            allotted: false,
            message: 'No result returned for this BOID',
          },
          item.index,
        );
        continue;
      }
      emit(
        {
          accountId: account.id,
          accountName: account.name,
          username: account.username,
          boidMasked: item.masked,
          ok: row.ok,
          allotted: row.allotted,
          quantity: row.quantity ?? undefined,
          message: formatAllotmentMessage({
            ok: row.ok,
            allotted: row.allotted,
            quantity: row.quantity ?? undefined,
            message: row.message,
          }),
        },
        item.index,
      );
    }

    if (start + BATCH_SIZE < pending.length) {
      await sleep(BATCH_GAP_MS);
    }
  }

  results.sort((a, b) => {
    const ai = resolved.findIndex((r) => r.account.id === a.accountId);
    const bi = resolved.findIndex((r) => r.account.id === b.accountId);
    return ai - bi;
  });

  return {
    companyShareId: Number(opts.companyShareId) || 0,
    companyName: opts.companyName,
    source: 'public',
    results,
  };
}
