import { stringToUUID } from '../core';

export const ROLLDOWN_DEBUG_ID_PLACEHOLDER = 'SENTRY_DEBUG_ID_PLACEHOLDER_00000000';

type GeneratedBundle = Record<
  string,
  {
    type?: string;
    fileName?: string;
    code?: string;
  }
>;

const SENTRY_DEBUG_ID_IDENTIFIER = '_sentryDebugIdIdentifier';
const SENTRY_DEBUG_ID_IDENTIFIER_PREFIX = 'sentry-dbid-';

function replaceAt(code: string, start: number, search: string, replacement: string): string {
  return `${code.slice(0, start)}${replacement}${code.slice(start + search.length)}`;
}

export function finalizeRolldownDebugIds(bundle: GeneratedBundle): void {
  for (const [fileName, chunk] of Object.entries(bundle)) {
    if (chunk.type !== 'chunk' || !chunk.code) {
      continue;
    }

    const identifier = `${SENTRY_DEBUG_ID_IDENTIFIER_PREFIX}${ROLLDOWN_DEBUG_ID_PLACEHOLDER}`;
    const identifierPropertyStart = chunk.code.indexOf(SENTRY_DEBUG_ID_IDENTIFIER);
    const identifierStart = chunk.code.indexOf(identifier, identifierPropertyStart + SENTRY_DEBUG_ID_IDENTIFIER.length);
    if (identifierStart === -1) {
      continue;
    }

    const identifierPlaceholderStart = identifierStart + SENTRY_DEBUG_ID_IDENTIFIER_PREFIX.length;
    const debugIdsPlaceholderStart = chunk.code.lastIndexOf(ROLLDOWN_DEBUG_ID_PLACEHOLDER, identifierStart - 1);
    if (debugIdsPlaceholderStart === -1) {
      throw new Error(`Failed to locate the Sentry debug ID placeholder for chunk \`${fileName}\`.`);
    }

    // Including the final filename disambiguates otherwise identical chunks. The fixed-width replacement deliberately
    // happens after Rolldown computes [hash], so the emitted filename represents the placeholder-bearing chunk.
    const debugId = stringToUUID(JSON.stringify([chunk.fileName ?? fileName, chunk.code]));
    const codeWithIdentifier = replaceAt(
      chunk.code,
      identifierPlaceholderStart,
      ROLLDOWN_DEBUG_ID_PLACEHOLDER,
      debugId,
    );
    chunk.code = replaceAt(codeWithIdentifier, debugIdsPlaceholderStart, ROLLDOWN_DEBUG_ID_PLACEHOLDER, debugId);
  }
}
