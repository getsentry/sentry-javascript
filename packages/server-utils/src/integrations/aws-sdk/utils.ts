import { CLOUD_REGION, RPC_METHOD, RPC_SERVICE, RPC_SYSTEM } from '@sentry/conventions/attributes';
import type { CommandInput, NormalizedRequest } from './types';

export function removeSuffixFromStringIfExists(str: string, suffixToRemove: string): string {
  const suffixLength = suffixToRemove.length;
  return str?.slice(-suffixLength) === suffixToRemove ? str.slice(0, -suffixLength) : str;
}

export function normalizeV3Request(
  serviceName: string,
  commandNameWithSuffix: string,
  commandInput: CommandInput,
  region: string | undefined,
): NormalizedRequest {
  return {
    serviceName: serviceName?.replace(/\s+/g, ''),
    commandName: removeSuffixFromStringIfExists(commandNameWithSuffix, 'Command'),
    commandInput,
    region,
  };
}

export function extractAttributesFromNormalizedRequest(normalizedRequest: NormalizedRequest): Record<string, unknown> {
  return {
    // oxlint-disable-next-line typescript/no-deprecated -- old-semconv rpc.system, matched to the OTel aws-sdk integration
    [RPC_SYSTEM]: 'aws-api',
    [RPC_METHOD]: normalizedRequest.commandName,
    [RPC_SERVICE]: normalizedRequest.serviceName,
    [CLOUD_REGION]: normalizedRequest.region,
  };
}
