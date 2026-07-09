import { RPC_METHOD, RPC_SERVICE } from '@sentry/conventions/attributes';
import { ATTR_RPC_SYSTEM, CLOUD_REGION } from './constants';
import type { NormalizedRequest } from './types';

export function removeSuffixFromStringIfExists(str: string, suffixToRemove: string): string {
  const suffixLength = suffixToRemove.length;
  return str?.slice(-suffixLength) === suffixToRemove ? str.slice(0, str.length - suffixLength) : str;
}

export function normalizeV3Request(
  serviceName: string,
  commandNameWithSuffix: string,
  commandInput: Record<string, any>,
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
    [ATTR_RPC_SYSTEM]: 'aws-api',
    [RPC_METHOD]: normalizedRequest.commandName,
    [RPC_SERVICE]: normalizedRequest.serviceName,
    [CLOUD_REGION]: normalizedRequest.region,
  };
}
