import { describe, expect, it } from 'vitest';
import { addDebugIdToSourceMap, findDebugId, getDebugId, injectDebugIdSnippet } from '../../src/v3/debugId';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function withInlineSourceMap(code: string, map: object): string {
  return `${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}`;
}

function readInlineSourceMap(source: string): Record<string, unknown> {
  const encoded = source.match(/sourceMappingURL=data:application\/json;base64,(.+)$/)?.[1] ?? '';
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

describe('getDebugId', () => {
  it('returns a UUID v4 shaped ID', () => {
    expect(getDebugId('export const a = 1;')).toMatch(UUID_REGEX);
  });

  it('is derived from the source only', () => {
    expect(getDebugId('export const a = 1;')).toBe(getDebugId('export const a = 1;'));
    expect(getDebugId('export const a = 1;')).not.toBe(getDebugId('export const a = 2;'));
  });

  it('matches the ID the bundler plugins derive from the same input', () => {
    // `stringToUUID('')` in `@sentry/bundler-plugins/core`.
    expect(getDebugId('')).toBe('e3b0c442-98fc-4c14-9afb-f4c8996fb924');
  });
});

describe('injectDebugIdSnippet', () => {
  const debugId = getDebugId('module');

  it('puts the snippet on the first line', () => {
    const output = injectDebugIdSnippet('export const a = 1;', debugId);

    expect(output.split('\n')).toEqual([expect.stringContaining(`sentry-dbid-${debugId}`), 'export const a = 1;']);
  });

  it('registers the ID in `_sentryDebugIds` keyed by the stack', () => {
    const globalObject = globalThis as { _sentryDebugIds?: Record<string, string> };
    delete globalObject._sentryDebugIds;

    // oxlint-disable-next-line typescript/no-implied-eval
    new Function(injectDebugIdSnippet('', debugId))();

    expect(Object.values(globalObject._sentryDebugIds ?? {})).toEqual([debugId]);
    delete globalObject._sentryDebugIds;
  });

  it('returns a source map that shifts the incoming positions down one line', () => {
    const input = withInlineSourceMap('import a from "a";\nexport const b = a;', {
      version: 3,
      sources: ['/assets/app/entry.ts'],
      names: [],
      // Line 0 has segments at columns 0 and 4, line 1 at columns 0 and 6.
      mappings: 'AAAA,IAAI;AACA,MAAM',
    });

    const output = injectDebugIdSnippet(input, debugId);

    expect(output.split('\n').slice(1, 3)).toEqual(['import a from "a";', 'export const b = a;']);
    expect(readInlineSourceMap(output)).toEqual({
      version: 3,
      sources: ['/assets/app/entry.ts'],
      names: [],
      // Identity at the same columns, one line lower. The first segment of the second line steps
      // back from column 4 to 0, hence `J` (-4).
      mappings: ';AAAA,IAAI;AACJ,MAAM',
    });
  });
});

describe('findDebugId', () => {
  it('reads the ID back out of minified code', () => {
    const debugId = getDebugId('module');
    const minified = injectDebugIdSnippet('', debugId).replace(/"/g, '`');

    expect(findDebugId(minified)).toBe(debugId);
  });

  it('returns undefined for code without a snippet', () => {
    expect(findDebugId('export const a = 1;')).toBeUndefined();
  });
});

describe('addDebugIdToSourceMap', () => {
  it('sets both field names and keeps the rest of the map', () => {
    const map = JSON.parse(addDebugIdToSourceMap('{"version":3,"mappings":"AAAA"}', 'abc'));

    expect(map).toEqual({ version: 3, mappings: 'AAAA', debugId: 'abc', debug_id: 'abc' });
  });
});
