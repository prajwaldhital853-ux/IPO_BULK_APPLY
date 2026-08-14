/**
 * Pure scenario checks for multi-device active-account resolution.
 * The active set is derived (oldest demats first) — users never choose it.
 * Run: npx --yes tsx mobile/scripts/checkActiveSlotsScenarios.ts
 */
import {
  resolveActiveSlots,
  type ActiveSlotsStored,
} from '../src/utils/activeSlotsRules';
import type { AccountMeta } from '../src/types/account';

function acc(id: string, demat: string, addedAt?: string): AccountMeta {
  return {
    id,
    name: id,
    dpId: '174',
    dpName: 'Test',
    username: demat.slice(-8) || id,
    demat,
    ...(addedAt ? { addedAt } : {}),
  };
}

function dematKeys(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `d:${prefix}${String(i).padStart(8, '0')}`,
  );
}

function phone(prefix: string, count: number): AccountMeta[] {
  return Array.from({ length: count }, (_, i) =>
    acc(
      `${prefix}${i}`,
      `${prefix}${String(i).padStart(8, '0')}`,
      new Date(2026, 0, 1 + i).toISOString(),
    ),
  );
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function server(keys: string[], max: number, total: number): ActiveSlotsStored {
  return { keys, maxAccounts: max, total };
}

function run() {
  // --- Both phones under the limit: nothing is locked. ---
  {
    const a = phone('13013700', 12);
    const keys = dematKeys('13013700', 12).concat(dematKeys('13013701', 8));
    const r = resolveActiveSlots(a, 20, server(keys, 20, 20));
    assert(!r.overQuota, 'under limit must not be over quota');
    assert(r.activeIds.size === 12, 'all local accounts active');
  }

  // --- Admin drops 20 → 10: the first 10 stay active on every phone. ---
  {
    const a = phone('13013700', 10);
    // Phone A registered first, so its demats own the 10 active slots.
    const r = resolveActiveSlots(a, 10, server(dematKeys('13013700', 10), 10, 20));
    assert(!r.overQuota, 'phone A keeps all 10 active');
    assert(r.activeIds.size === 10, 'A has the 10 active demats');
  }
  {
    const b = phone('13013701', 10);
    const r = resolveActiveSlots(b, 10, server(dematKeys('13013700', 10), 10, 20));
    assert(r.overQuota, 'phone B is fully locked out');
    assert(r.activeIds.size === 0, 'none of B demats are active');
    assert(r.lockedIds.length === 10, 'all 10 of B are locked');
  }

  // --- One phone holds more demats than the cap: oldest N active. ---
  {
    const a = phone('13013700', 30);
    const r = resolveActiveSlots(a, 20, server(dematKeys('13013700', 20), 20, 30));
    assert(r.overQuota, 'extra demats are locked');
    assert(r.activeIds.size === 20, '20 active');
    assert(r.lockedIds.length === 10, '10 locked');
  }

  // --- An active demat is deleted → the queue promotes the next one. ---
  {
    const a = phone('13013700', 30);
    const promoted = dematKeys('13013700', 21).filter(
      (k) => k !== 'd:1301370000000000',
    );
    const r = resolveActiveSlots(a, 20, server(promoted, 20, 30));
    assert(r.activeIds.size === 20, 'still 20 active after promotion');
    assert(!r.activeIds.has('130137000'), 'deleted demat is gone');
  }

  // --- Same demats on two phones count once, so both are fully active. ---
  {
    const b = phone('13013700', 20);
    const r = resolveActiveSlots(b, 20, server(dematKeys('13013700', 20), 20, 20));
    assert(!r.overQuota, 'mirrored phones are not over quota');
    assert(r.activeIds.size === 20, 'all mirrored demats active');
  }

  // --- Stale cache for an old cap is ignored; local rule applies instead. ---
  {
    const a = phone('13013700', 30);
    const r = resolveActiveSlots(a, 10, server(dematKeys('13013700', 20), 20, 30));
    assert(r.activeIds.size === 10, 'stale cache must not grant 20 slots');
  }

  // --- Offline / guest: oldest-first locally, no server data. ---
  {
    const a = phone('13013700', 25);
    const r = resolveActiveSlots(a, 20, null);
    assert(r.overQuota && r.activeIds.size === 20, 'offline falls back to 20');
    assert(r.activeIds.has('130137000'), 'oldest stays active offline');
    assert(!r.activeIds.has('1301370024'), 'newest is locked offline');
  }

  // --- Unlimited plan: everything active. ---
  {
    const a = phone('13013700', 200);
    const r = resolveActiveSlots(a, 999999, null);
    assert(!r.overQuota && r.activeIds.size === 200, 'unlimited keeps all');
  }

  // --- 36 on A + 36 on B, cap 51: A keeps 36, B only 15, rest locked. ---
  {
    const a = phone('13013700', 36);
    const b = phone('13013701', 36);
    const active = dematKeys('13013700', 36).concat(dematKeys('13013701', 15));
    const stored = server(active, 51, 72);
    const rA = resolveActiveSlots(a, 51, stored);
    const rB = resolveActiveSlots(b, 51, stored);
    assert(!rA.overQuota && rA.activeIds.size === 36, 'phone A stays fully active');
    assert(rB.overQuota, 'phone B extras must lock');
    assert(rB.activeIds.size === 15, 'phone B only fills remaining slots');
    assert(rB.lockedIds.length === 21, '21 on phone B stay locked');
  }

  console.log('All derived active-slot scenarios passed.');
}

run();
