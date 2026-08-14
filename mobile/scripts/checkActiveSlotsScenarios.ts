/**
 * Pure scenario checks for multi-device active-account resolution.
 * Run: npx --yes tsx mobile/scripts/checkActiveSlotsScenarios.ts
 */
import {
  resolveActiveSlots,
  type ActiveSlotsStored,
} from '../src/storage/activeAccountSlots';
import type { AccountMeta } from '../src/types/account';

function acc(id: string, demat: string): AccountMeta {
  return {
    id,
    name: id,
    dpId: '174',
    dpName: 'Test',
    username: demat.slice(-8) || id,
    demat,
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function run() {
  const max = 50;

  // --- 2 devices, under limit ---
  {
    const a = Array.from({ length: 30 }, (_, i) =>
      acc(`a${i}`, `13013700${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(a, max, null, 40); // 30 local + 10 other
    assert(!r.overQuota && !r.needsPick, '2dev under limit should be normal');
    assert(r.activeIds.size === 30, 'all local active under limit');
  }

  // --- 2 devices, admin drops limit (90+10 → max 50) ---
  {
    const a = Array.from({ length: 90 }, (_, i) =>
      acc(`a${i}`, `13013700${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(a, 50, null, 100);
    assert(r.overQuota && r.needsPick, 'phone with 90 must needsPick after drop');
    assert(r.activeIds.size === 0, 'nothing usable until pick');
  }
  {
    const b = Array.from({ length: 10 }, (_, i) =>
      acc(`b${i}`, `13013701${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(b, 50, null, 100);
    assert(r.overQuota && r.needsPick, 'small phone also needsPick when claimed>max');
  }

  // --- 2 devices, after full pick on phone A ---
  {
    const keys = Array.from({ length: 50 }, (_, i) =>
      `d:13013700${String(i).padStart(8, '0')}`,
    );
    const stored: ActiveSlotsStored = {
      ids: [],
      keys,
      confirmedForMax: 50,
    };
    const a = Array.from({ length: 90 }, (_, i) =>
      acc(`a${i}`, `13013700${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(a, 50, stored, 100);
    assert(r.overQuota && !r.needsPick, 'extras locked, no re-pick');
    assert(r.activeIds.size === 50, '50 active on big phone');
    assert(r.lockedKeys.length === 50, 'shared lock present');
  }
  {
    // Phone B only has demats outside the chosen 50
    const keys = Array.from({ length: 50 }, (_, i) =>
      `d:13013700${String(i).padStart(8, '0')}`,
    );
    const stored: ActiveSlotsStored = { ids: [], keys, confirmedForMax: 50 };
    const b = Array.from({ length: 10 }, (_, i) =>
      acc(`b${i}`, `13013799${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(b, 50, stored, 100);
    assert(r.overQuota && !r.needsPick, 'non-matching phone locked');
    assert(r.activeIds.size === 0, 'none of B demats are active');
  }
  {
    // Same 50 demats on both phones — should be normal after lock
    const keys = Array.from({ length: 50 }, (_, i) =>
      `d:13013700${String(i).padStart(8, '0')}`,
    );
    const stored: ActiveSlotsStored = { ids: [], keys, confirmedForMax: 50 };
    const b = Array.from({ length: 50 }, (_, i) =>
      acc(`b${i}`, `13013700${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(b, 50, stored, 100);
    assert(!r.overQuota && !r.needsPick, 'duplicate demats on 2 phones OK after pick');
    assert(r.activeIds.size === 50, 'all matching active');
  }

  // --- 2 devices, partial fill (20/50) ---
  {
    const keys = Array.from({ length: 20 }, (_, i) =>
      `d:13013700${String(i).padStart(8, '0')}`,
    );
    const stored: ActiveSlotsStored = { ids: [], keys, confirmedForMax: 50 };
    const a = Array.from({ length: 90 }, (_, i) =>
      acc(`a${i}`, `13013700${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(a, 50, stored, 100);
    assert(r.overQuota && !r.needsPick, 'partial lock → fill mode');
    assert(r.activeIds.size === 20, '20 active so far');
    assert(r.lockedKeys.length === 20, '20 locked keys');
  }

  // --- 3 devices, under limit 20+15+10 ---
  {
    const a = Array.from({ length: 20 }, (_, i) =>
      acc(`a${i}`, `13013700${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(a, 50, null, 45);
    assert(!r.overQuota && !r.needsPick, '3dev under limit normal');
  }

  // --- 3 devices, over after drop 40+30+20 → max 50 ---
  {
    const a = Array.from({ length: 40 }, (_, i) =>
      acc(`a${i}`, `13013700${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(a, 50, null, 90);
    assert(r.overQuota && r.needsPick, '3dev phone A needs pick');
  }
  {
    const c = Array.from({ length: 20 }, (_, i) =>
      acc(`c${i}`, `13013702${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(c, 50, null, 90);
    assert(r.overQuota && r.needsPick, '3dev small phone needs pick too');
  }

  // --- 3 devices, after A locked 50, B and C extras ---
  {
    const keys = Array.from({ length: 50 }, (_, i) =>
      `d:13013700${String(i).padStart(8, '0')}`,
    );
    const stored: ActiveSlotsStored = { ids: [], keys, confirmedForMax: 50 };
    const b = Array.from({ length: 30 }, (_, i) =>
      acc(`b${i}`, `13013701${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(b, 50, stored, 90);
    assert(r.overQuota && !r.needsPick, 'B cannot start a new set');
    assert(r.activeIds.size === 0, 'B demats not in A set → inactive');
  }

  // --- stale lock for old cap ---
  {
    const keys = Array.from({ length: 50 }, (_, i) =>
      `d:13013700${String(i).padStart(8, '0')}`,
    );
    const stored: ActiveSlotsStored = { ids: [], keys, confirmedForMax: 100 };
    const a = Array.from({ length: 90 }, (_, i) =>
      acc(`a${i}`, `13013700${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(a, 50, stored, 100);
    assert(r.overQuota && r.needsPick, 'stale confirmedForMax=100 must re-pick');
  }

  // --- unlimited ---
  {
    const a = Array.from({ length: 200 }, (_, i) =>
      acc(`a${i}`, `13013700${String(i).padStart(8, '0')}`),
    );
    const r = resolveActiveSlots(a, 999999, null, 500);
    assert(!r.overQuota && !r.needsPick, 'unlimited ignores claimed');
  }

  console.log('All 2/3-device active-slot scenarios passed.');
}

run();
