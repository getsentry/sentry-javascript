import { createHash } from 'node:crypto';

// Mirrors `stringToUUID` and `getDebugIdSnippet` in `@sentry/bundler-plugins/core`. Importing that
// entry at runtime would load the whole build plugin (a native parser, the Sentry CLI) into the server.

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const DEBUG_ID_IDENTIFIER_REGEX = /sentry-dbid-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

const INLINE_SOURCE_MAP_REGEX = /\n?\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/;

interface SourceMap {
  mappings: string;
  sources?: string[];
  [key: string]: unknown;
}

/**
 * Hashes `source` into a UUID shaped ID. It has to be deterministic, because the source map upload
 * runs in a different process than the server and must arrive at the same ID.
 */
export function getDebugId(source: string): string {
  const hash = createHash('sha256').update(source).digest('hex');
  // RFC 4122 section 4.4: the variant nibble is one of 8, 9, a, b.
  const variant = ['8', '9', 'a', 'b'][hash.charCodeAt(16) % 4] as string;

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** The snippet that registers a module's debug ID in `globalThis._sentryDebugIds`, keyed by its stack. */
export function getDebugIdSnippet(debugId: string): string {
  return `!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="${debugId}",e._sentryDebugIdIdentifier="sentry-dbid-${debugId}");}catch(e){}}();`;
}

/** Reads back the debug ID that {@link getDebugIdSnippet} put into a module, which survives minification. */
export function findDebugId(code: string): string | undefined {
  return code.match(DEBUG_ID_IDENTIFIER_REGEX)?.[1];
}

/**
 * Puts the debug ID snippet on its own line at the top of `source`, so it runs before the module
 * body and registers the ID even when that body throws.
 *
 * `source` may end in an inline source map, which is how the asset server hands a module to its
 * loaders. The returned map then maps back to `source` and the asset server composes it with its
 * own, so it only has to shift every line down by one.
 */
export function injectDebugIdSnippet(source: string, debugId: string): string {
  const snippet = getDebugIdSnippet(debugId);
  const inlineSourceMap = source.match(INLINE_SOURCE_MAP_REGEX);

  if (!inlineSourceMap?.[1]) {
    return `${snippet}\n${source}`;
  }

  const code = source.slice(0, inlineSourceMap.index);
  const map = JSON.parse(Buffer.from(inlineSourceMap[1], 'base64').toString('utf8')) as SourceMap;
  const shiftedMap = {
    version: 3,
    sources: map.sources?.slice(0, 1) ?? [],
    names: [],
    mappings: getShiftedIdentityMappings(map.mappings),
  };

  return `${snippet}\n${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(shiftedMap)).toString('base64')}`;
}

/** Adds the debug ID to a source map, under both field names the upload tooling reads. */
export function addDebugIdToSourceMap(sourceMap: string, debugId: string): string {
  const map = JSON.parse(sourceMap) as SourceMap;
  map.debug_id = debugId;
  map.debugId = debugId;
  return JSON.stringify(map);
}

/**
 * Maps line `n + 1` of the output to line `n` of the input, at exactly the columns the input map
 * has segments for. Composition only keeps positions both maps know about, so a coarser identity
 * map would lose precision.
 */
function getShiftedIdentityMappings(mappings: string): string {
  let previousLine = 0;
  let previousColumn = 0;

  const lines = mappings.split(';').map((line, lineIndex) => {
    let column = 0;
    let previousGeneratedColumn = 0;

    return line
      .split(',')
      .filter(Boolean)
      .map(segment => {
        column += decodeFirstVlq(segment);
        const encoded = `${encodeVlq(column - previousGeneratedColumn)}A${encodeVlq(lineIndex - previousLine)}${encodeVlq(column - previousColumn)}`;
        previousGeneratedColumn = column;
        previousLine = lineIndex;
        previousColumn = column;
        return encoded;
      })
      .join(',');
  });

  return `;${lines.join(';')}`;
}

// A segment's first field is its generated column, relative to the previous segment on the line.
function decodeFirstVlq(segment: string): number {
  let value = 0;
  let factor = 1;
  let index = 0;
  let digit: number;

  do {
    digit = BASE64_CHARS.indexOf(segment.charAt(index++));
    value += (digit % 32) * factor;
    factor *= 32;
  } while (digit >= 32);

  // The lowest bit is the sign.
  return value % 2 ? -(value - 1) / 2 : value / 2;
}

function encodeVlq(value: number): string {
  let vlq = value < 0 ? -value * 2 + 1 : value * 2;
  let encoded = '';

  do {
    const digit = vlq % 32;
    vlq = Math.floor(vlq / 32);
    // Sets the continuation bit.
    encoded += BASE64_CHARS.charAt(vlq > 0 ? digit + 32 : digit);
  } while (vlq > 0);

  return encoded;
}
