import { portfolioTool } from './portfolio';
import { marketTool } from './market';
import { governanceTool } from './governance';

export const injectiveTools = {
  getPortfolio: portfolioTool,
  getMarketSnapshot: marketTool,
  getGovernance: governanceTool,
};
