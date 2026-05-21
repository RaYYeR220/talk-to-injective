import { tool } from 'ai';
import { z } from 'zod';
import { chainGovApi } from './client';

// Cosmos gov proposal status (numeric to stay robust across SDK enum churn):
// 2 = voting period (active), 3 = passed.
const STATUS_VOTING_PERIOD = 2;
const STATUS_PASSED = 3;

export interface ProposalLite { id: number; title: string; status: string; }
export interface ProposalFull extends ProposalLite { summary: string; endTime?: string; }
export interface GovList { kind: 'list'; proposals: ProposalLite[]; }
export interface GovOne { kind: 'one'; proposal: ProposalFull | null; message?: string; }

// Real mainnet shape (gov v1): p.title and p.summary are top-level fields.
// Fallback to p.content.title / p.content.description for legacy gov v1beta1 proposals.
function readTitle(p: any): string {
  return p?.title ?? p?.content?.title ?? `Proposal #${p?.proposalId ?? p?.id}`;
}
function readSummary(p: any): string {
  return p?.summary ?? p?.content?.description ?? p?.description ?? '';
}

async function fetchByStatus(status: number): Promise<ProposalLite[]> {
  const res = await chainGovApi.fetchProposals({ status: status as any });
  return ((res as any).proposals ?? []).map((p: any) => ({
    id: Number(p.proposalId ?? p.id),
    title: readTitle(p),
    status: String(p.status),
  }));
}

export async function getGovernanceData(proposalId?: number): Promise<GovList | GovOne> {
  if (proposalId == null) {
    // Prefer active (voting-period) proposals; if none are live, fall back to the most
    // recent passed ones so the list (and the demo) always has content.
    let proposals = await fetchByStatus(STATUS_VOTING_PERIOD);
    if (proposals.length === 0) {
      proposals = (await fetchByStatus(STATUS_PASSED)).sort((a, b) => b.id - a.id).slice(0, 10);
    }
    return { kind: 'list', proposals };
  }

  try {
    const p: any = await chainGovApi.fetchProposal(proposalId);
    return {
      kind: 'one',
      proposal: {
        id: Number(p.proposalId ?? p.id ?? proposalId),
        title: readTitle(p),
        status: String(p.status),
        summary: readSummary(p),
        endTime: p.votingEndTime != null ? String(p.votingEndTime) : p.endTime,
      },
    };
  } catch {
    return { kind: 'one', proposal: null, message: `No proposal #${proposalId} found.` };
  }
}

export const governanceTool = tool({
  description:
    'Read Injective governance. With no id, lists active (voting-period) proposals, or the most recent passed ones if none are currently live. With an id, returns that proposal so you can explain it in plain English. Use for "what proposals are live?" or "explain proposal #482".',
  inputSchema: z.object({
    proposalId: z.number().optional().describe('Proposal number to fetch; omit to list active proposals.'),
  }),
  execute: async ({ proposalId }) => getGovernanceData(proposalId),
});
