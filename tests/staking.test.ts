import { describe, it, expect, beforeAll } from 'vitest';
import { chainStakingApi } from '../lib/injective/client';
import { getStakingData } from '../lib/injective/staking';

// Stable fallback if we can't derive a live delegator at run time.
const KNOWN_DELEGATOR = 'inj1p4qgrapyuxrurm0jyux9s2q8fn4ghsxwy24mt3';

let delegator = KNOWN_DELEGATOR;
beforeAll(async () => {
  // Derive a WHALE delegator (not a dust account) so the wallet assertions exercise
  // real INJ magnitudes — that's what makes the scaling guards below meaningful.
  // Pick the top validator by tokens, then its largest delegator.
  try {
    const { validators } = await chainStakingApi.fetchValidators();
    const bonded = validators.filter((x) => x.status === 'Bonded');
    bonded.sort((a, b) => Number(b.tokens) - Number(a.tokens));
    const top = bonded[0] ?? validators[0];
    const { delegations } = await chainStakingApi.fetchDelegatorsNoThrow({
      validatorAddress: top.operatorAddress,
    });
    const whale = (delegations ?? [])
      .slice()
      .sort((a, b) => Number(b.balance.amount) - Number(a.balance.amount))[0];
    const addr = whale?.delegation?.delegatorAddress;
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
    // bondedTokens is network-wide staked INJ: tens of millions. Lower bound > 1e6 and
    // upper bound < 1e9 catch a 1e18 scaling error in EITHER direction
    // (raw base units would be ~1e25; double-converting would be ~1e-11).
    expect(res.totalBondedInj).toBeGreaterThan(1e6);
    expect(res.totalBondedInj).toBeLessThan(1e9);
    expect(res.wallet).toBeUndefined();
  }, 30000);

  it('includes wallet staking details for a real (whale) delegator', async () => {
    const res = await getStakingData(delegator);
    if ('error' in res) throw new Error(res.error);
    expect(res.wallet).toBeDefined();
    const w = res.wallet!;
    expect(w.validatorCount).toBeGreaterThan(0);
    // A whale stakes far more than 1 INJ but less than total supply — a band that
    // a 1e18 mis-scale (base units ~1e23, or double-converted ~1e-15) cannot satisfy.
    expect(w.totalStakedInj).toBeGreaterThan(1);
    expect(w.totalStakedInj).toBeLessThan(1e8);
    // Rewards can briefly be ~0 right after a claim, so only bound the top end here.
    expect(w.pendingRewardsInj).toBeGreaterThanOrEqual(0);
    expect(w.pendingRewardsInj).toBeLessThan(1e6);
  }, 30000);

  it('rejects a malformed address', async () => {
    const res = await getStakingData('not-an-address');
    expect('error' in res).toBe(true);
  });
});
