import { getNetworkEndpoints, Network } from '@injectivelabs/networks';
import {
  ChainGrpcBankApi,
  ChainGrpcGovApi,
  IndexerGrpcDerivativesApi,
} from '@injectivelabs/sdk-ts';

// Mainnet, read-only. Switch network here only.
const endpoints = getNetworkEndpoints(Network.Mainnet);

export const chainBankApi = new ChainGrpcBankApi(endpoints.grpc);
export const chainGovApi = new ChainGrpcGovApi(endpoints.grpc);
export const indexerDerivativesApi = new IndexerGrpcDerivativesApi(endpoints.indexer);
