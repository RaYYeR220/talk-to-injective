import { describe, it, expect, beforeAll } from 'vitest';
import { chainStakingApi } from '../lib/injective/client';
import { getStakingData } from '../lib/injective/staking';

// Stable fallback if we can't derive a live delegator at run time.
const KNOWN_DELEGATOR = 'inj1p4qgrapyuxrurm0jyux9s2q8fn4ghsxwy24mt3';

let delegator = KNOWN_DELEGATOR;
beforeAll(async () => {
  // Prefer a guaranteed-active delegator: pick a bonded validator, take one of its delegators.
  try {
    const { validators } = await chainStakingApi.fetchValidators();
    const v = validators.find((x) => x.status === 'Bonded') ?? validators[0];
    const { delegations } = await chainStakingApi.fetchDelegatorsNoThrow({
      validatorAddress: v.operatorAddress,
    });
    const addr = delegations?.[0]?.delegation?.delegatorAddress;
    if (addr) delegator = addr;
  } catch {
    // keep fallback
  }
}, 30000);

describe('getStakingData (mainnet, read-only)', () => {
  it('returns a sane network APR and total bonded without an address', async () => {
    const res = await getStakingData();
    if ('error' in res) throw new Error(res.error);
    expect(res.aprPercent).toMatch(/^\d+(\.\d+)?%$/);
    const apr = Number(res.aprPercent.replace('%', ''));
    expect(apr).toBeGreaterThan(0);
    expect(apr).toBeLessThan(100);
    expect(res.totalBondedInj).toBeGreaterThan(0);
    // human INJ (tens of millions), not raw base units (would be > 1e9)
    expect(res.totalBondedInj).toBeLessThan(1e9);
    expect(res.wallet).toBeUndefined();
  }, 30000);

  it('includes wallet staking details for a real delegator', async () => {
    const res = await getStakingData(delegator);
    if ('error' in res) throw new Error(res.error);
    expect(res.wallet).toBeDefined();
    const w = res.wallet!;
    expect(typeof w.totalStakedInj).toBe('number');
    expect(w.totalStakedInj).toBeGreaterThanOrEqual(0);
    expect(w.totalStakedInj).toBeLessThan(1e9); // human INJ, not base units
    expect(Number.isInteger(w.validatorCount)).toBe(true);
    expect(w.validatorCount).toBeGreaterThanOrEqual(0);
    expect(w.pendingRewardsInj).toBeGreaterThanOrEqual(0);
    expect(w.pendingRewardsInj).toBeLessThan(1e7); // catches a 10^18 scaling bug
  }, 30000);

  it('rejects a malformed address', async () => {
    const res = await getStakingData('not-an-address');
    expect('error' in res).toBe(true);
  });
});
