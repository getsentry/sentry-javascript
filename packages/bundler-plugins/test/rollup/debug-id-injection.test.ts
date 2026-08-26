import { describe, expect, it } from 'vitest';
import {
  finalizeRolldownDebugIds,
  getDebugIdForChunk,
  hasExistingDebugID,
  ROLLDOWN_DEBUG_ID_PLACEHOLDER,
  type GeneratedBundle,
} from '../../src/rollup/debug-id-injection';

const UUID_PATTERN = /[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/g;

function provisionalCode(userCode = 'console.log("test");'): string {
  return [
    `globalThis._sentryDebugIds[stack]="${ROLLDOWN_DEBUG_ID_PLACEHOLDER}";`,
    `globalThis._sentryDebugIdIdentifier="sentry-dbid-${ROLLDOWN_DEBUG_ID_PLACEHOLDER}";`,
    userCode,
  ].join('');
}

function finalize(code: string, fileName = 'bundle.js'): string {
  const bundle: GeneratedBundle = {
    [fileName]: { type: 'chunk', fileName, code },
  };

  finalizeRolldownDebugIds(bundle);
  const output = bundle[fileName];
  expect(output?.type).toBe('chunk');

  return output?.type === 'chunk' ? output.code : '';
}

function extractDebugId(code: string): string {
  const debugIds = code.match(UUID_PATTERN);
  expect(debugIds).toHaveLength(2);
  expect(new Set(debugIds)).toHaveLength(1);

  return debugIds?.[0] ?? '';
}

describe('debug ID injection', () => {
  it('uses a placeholder for Rolldown and a deterministic UUID for Rollup', () => {
    expect(getDebugIdForChunk('code', true)).toBe(ROLLDOWN_DEBUG_ID_PLACEHOLDER);
    expect(getDebugIdForChunk('code', false)).toMatch(UUID_PATTERN);
    expect(getDebugIdForChunk('code', false)).toBe(getDebugIdForChunk('code', false));
  });

  it('detects existing inline and comment debug IDs at chunk boundaries', () => {
    expect(hasExistingDebugID('globalThis._sentryDebugIdIdentifier="sentry-dbid-existing";')).toBe(true);
    expect(hasExistingDebugID('console.log("test");\n//# debugId=existing')).toBe(true);
    expect(hasExistingDebugID('console.log("test");')).toBe(false);
  });

  it('generates stable IDs from finalized code and filenames', () => {
    const firstBuild = finalize(provisionalCode());
    const secondBuild = finalize(provisionalCode());

    expect(extractDebugId(firstBuild)).toBe(extractDebugId(secondBuild));
  });

  it('changes the ID when code or the filename changes', () => {
    const baseline = extractDebugId(finalize(provisionalCode('first')));

    expect(extractDebugId(finalize(provisionalCode('second')))).not.toBe(baseline);
    expect(extractDebugId(finalize(provisionalCode('first'), 'other.js'))).not.toBe(baseline);
  });

  it('does not replace placeholder-shaped user strings', () => {
    const userCode = `console.log("${ROLLDOWN_DEBUG_ID_PLACEHOLDER}");`;

    expect(finalize(provisionalCode(userCode))).toContain(userCode);
  });

  it('does not replace marker-shaped strings before the injected identifier', () => {
    const userCode = `// sentry-dbid-${ROLLDOWN_DEBUG_ID_PLACEHOLDER}\n`;
    const finalizedCode = finalize(`${userCode}${provisionalCode()}`);

    expect(finalizedCode).toContain(userCode);
    expect(extractDebugId(finalizedCode)).not.toBe('');
  });

  it('fails when the injected placeholder is incomplete', () => {
    const code = `globalThis._sentryDebugIdIdentifier="sentry-dbid-${ROLLDOWN_DEBUG_ID_PLACEHOLDER}";`;

    expect(() => finalize(code)).toThrow('Failed to locate the Sentry debug ID placeholder for chunk `bundle.js`.');
  });

  it('ignores non-chunk assets and chunks without provisional IDs', () => {
    const bundle: GeneratedBundle = {
      'asset.js': { type: 'asset', fileName: 'asset.js' },
      'chunk.js': { type: 'chunk', fileName: 'chunk.js', code: 'console.log("test");' },
    };

    finalizeRolldownDebugIds(bundle);

    expect(bundle).toEqual({
      'asset.js': { type: 'asset', fileName: 'asset.js' },
      'chunk.js': { type: 'chunk', fileName: 'chunk.js', code: 'console.log("test");' },
    });
  });
});
