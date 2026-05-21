import { tool } from 'ai';
import { z } from 'zod';
import { chainMintApi, chainStakingApi, chainDistributionApi } from './client';
import { formatTokenAmount, formatPercent } from './format';

const INJ_DECIMALS = 18;
const isInjAddress = (a: string) => /^inj1[0-9a-z]{38,}$/.test(a);

export interface StakingWallet {
  totalStakedInj: number;
  validatorCount: number;
  pendingRewardsInj: number;
}

export interface StakingInfo {
  aprPercent: string; // estimate, e.g. "12.4%"
  totalBondedInj: number; // network-wide staked INJ
  wallet?: StakingWallet; // present only when a valid address is supplied
}

export interface StakingError {
  error: string;
}

export type StakingResult = StakingInfo | StakingError;

export async function getStakingData(address?: string): Promise<StakingResult> {
  if (address != null && !isInjAddress(address)) {
    return { error: `"${address}" is not a valid Injective address (they start with "inj1").` };
  }

  let aprFraction: number;
  let totalBondedInj: number;
  try {
    const [{ annualProvisions }, pool, params] = await Promise.all([
      chainMintApi.fetchAnnualProvisions(),
      chainStakingApi.fetchPool(),
      chainDistributionApi.fetchModuleParams(),
    ]);
    // The SDK returns annualProvisions in base units (18 dp) but pool.bondedTokens
    // already in human INJ. Convert annualProvisions to human INJ before dividing.
    // communityTax is a plain decimal fraction (e.g. 0.05).
    const bonded = Number(pool.bondedTokens); // already human INJ
    const annualProvisionsHuman = formatTokenAmount(String(annualProvisions), INJ_DECIMALS);
    aprFraction =
      bonded > 0 ? (annualProvisionsHuman / bonded) * (1 - Number(params.communityTax)) : 0;
    totalBondedInj = bonded; // already human INJ, no conversion needed
  } catch {
    return { error: "Couldn't read staking data right now — try again in a moment." };
  }

  const info: StakingInfo = {
    // 3 significant figures, so an APR reads like "12.4%" / "8.27%" rather than "12%".
    aprPercent: formatPercent(aprFraction, 3),
    totalBondedInj,
  };

  if (address != null) {
    // Wallet phase has its own boundary: the NoThrow variants return empty (not throw)
    // for "nothing staked", but a transport error could still reject — keep the
    // StakingResult contract intact rather than letting it escape as an unhandled throw.
    try {
      const [delRes, validatorRewards] = await Promise.all([
        chainStakingApi.fetchDelegationsNoThrow({ injectiveAddress: address }),
        chainDistributionApi.fetchDelegatorRewardsNoThrow(address),
      ]);

      const delegations = delRes.delegations ?? [];
      const totalStakedInj = delegations.reduce(
        (sum, d) => sum + formatTokenAmount(d.balance?.amount ?? '0', INJ_DECIMALS),
        0,
      );
      // fetchDelegatorRewardsNoThrow returns one entry per validator; sum the INJ coin across all.
      const pendingRewardsInj = validatorRewards.reduce((sum, vr) => {
        const inj = (vr.rewards ?? []).find((c) => c.denom === 'inj');
        return sum + (inj ? formatTokenAmount(inj.amount, INJ_DECIMALS) : 0);
      }, 0);

      info.wallet = {
        totalStakedInj,
        validatorCount: delegations.length,
        pendingRewardsInj,
      };
    } catch {
      return { error: "Couldn't read this wallet's staking data right now — try again in a moment." };
    }
  }

  return info;
}

export const stakingTool = tool({
  description:
    'Read Injective staking info (read-only). With no address: the estimated APR for staking INJ and the total INJ staked network-wide. With an "inj1" address: also that wallet\'s total staked INJ, number of validators, and pending (unclaimed) rewards. Use for "what is the staking APR?", "how much can I earn staking INJ?", or "what am I staking?". The APR is always an estimate.',
  inputSchema: z.object({
    address: z
      .string()
      .optional()
      .describe('Optional Injective bech32 address (starts with "inj1") to include that wallet\'s staking details.'),
  }),
  execute: async ({ address }) => getStakingData(address),
});
