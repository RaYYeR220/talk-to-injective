import { portfolioTool } from './portfolio';
import { marketTool } from './market';
import { governanceTool } from './governance';
import { stakingTool } from './staking';

export const injectiveTools = {
  getPortfolio: portfolioTool,
  getMarketSnapshot: marketTool,
  getGovernance: governanceTool,
  getStaking: stakingTool,
};
