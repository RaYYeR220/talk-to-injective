import { describe, it, expect } from 'vitest';
import { getGovernanceData } from '../lib/injective/governance';

describe('getGovernanceData (mainnet, read-only)', () => {
  it('lists proposals when no id is given', async () => {
    const res = await getGovernanceData();
    if (res.kind !== 'list') throw new Error('expected a list result');
    expect(res.proposals.length).toBeGreaterThan(0);
    expect(typeof res.proposals[0].id).toBe('number');
    expect(typeof res.proposals[0].title).toBe('string');
    expect(res.proposals[0].title.length).toBeGreaterThan(0);
  });

  it('returns a single proposal by id', async () => {
    const list = await getGovernanceData();
    if (list.kind !== 'list') throw new Error('expected a list result');
    const id = list.proposals[0].id;
    const one = await getGovernanceData(id);
    if (one.kind !== 'one') throw new Error('expected a single result');
    expect(one.proposal?.id).toBe(id);
    expect((one.proposal?.title?.length ?? 0)).toBeGreaterThan(0);
  });
});
