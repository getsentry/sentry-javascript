import { stringToUUID } from '../core';

export const ROLLDOWN_DEBUG_ID_PLACEHOLDER = 'SENTRY_DEBUG_ID_PLACEHOLDER_00000000';

type GeneratedChunk = {
  type: 'chunk';
  fileName: string;
  code: string;
};

type GeneratedAsset = {
  type: 'asset';
  fileName: string;
};

export type GeneratedBundle = Record<string, GeneratedChunk | GeneratedAsset>;

const SENTRY_DEBUG_ID_IDENTIFIER = '_sentryDebugIdIdentifier';
const SENTRY_DEBUG_ID_IDENTIFIER_PREFIX = 'sentry-dbid-';

export function hasExistingDebugID(code: string): boolean {
  const chunkStartSnippet = code.slice(0, 6000);
  const chunkEndSnippet = code.slice(-500);

  return chunkStartSnippet.includes(SENTRY_DEBUG_ID_IDENTIFIER) || chunkEndSnippet.includes('//# debugId=');
}

export function getDebugIdForChunk(code: string, isRolldown: boolean): string {
  return isRolldown ? ROLLDOWN_DEBUG_ID_PLACEHOLDER : stringToUUID(code);
}

function replaceAt(code: string, start: number, search: string, replacement: string): string {
  return `${code.slice(0, start)}${replacement}${code.slice(start + search.length)}`;
}

export function finalizeRolldownDebugIds(bundle: GeneratedBundle): void {
  for (const [fileName, output] of Object.entries(bundle)) {
    if (output.type !== 'chunk') {
      continue;
    }

    const identifier = `${SENTRY_DEBUG_ID_IDENTIFIER_PREFIX}${ROLLDOWN_DEBUG_ID_PLACEHOLDER}`;
    const identifierPropertyStart = output.code.indexOf(SENTRY_DEBUG_ID_IDENTIFIER);
    const identifierStart = output.code.indexOf(
      identifier,
      identifierPropertyStart + SENTRY_DEBUG_ID_IDENTIFIER.length,
    );
    if (identifierStart === -1) {
      continue;
    }

    const identifierPlaceholderStart = identifierStart + SENTRY_DEBUG_ID_IDENTIFIER_PREFIX.length;
    const debugIdsPlaceholderStart = output.code.lastIndexOf(ROLLDOWN_DEBUG_ID_PLACEHOLDER, identifierStart - 1);
    if (debugIdsPlaceholderStart === -1) {
      throw new Error(`Failed to locate the Sentry debug ID placeholder for chunk \`${fileName}\`.`);
    }

    // Including the final filename disambiguates otherwise identical chunks. The fixed-width replacement deliberately
    // happens after Rolldown computes [hash], so the emitted filename represents the placeholder-bearing chunk.
    const debugId = stringToUUID(JSON.stringify([output.fileName, output.code]));
    const codeWithIdentifier = replaceAt(
      output.code,
      identifierPlaceholderStart,
      ROLLDOWN_DEBUG_ID_PLACEHOLDER,
      debugId,
    );
    output.code = replaceAt(codeWithIdentifier, debugIdsPlaceholderStart, ROLLDOWN_DEBUG_ID_PLACEHOLDER, debugId);
  }
}
