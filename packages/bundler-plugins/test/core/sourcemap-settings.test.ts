import { describe, it, expect } from 'vitest';
import { normalizeUserOptions } from '../../src/core/options-mapping';
import type { Options } from '../../src/core';
import { decideSourceMapHandling } from '../../src/core/sourcemap-settings';
import type { SourceMapKind } from '../../src/core/sourcemap-settings';

function options(sourcemaps?: Options['sourcemaps']) {
  return normalizeUserOptions({ org: 'o', project: 'p', authToken: 't', release: { name: 'r' }, sourcemaps });
}

const NO_CHANGE = { enableHidden: false, deleteAfterUpload: false };

describe('decideSourceMapHandling', () => {
  describe('with the option unset (auto)', () => {
    it('enables hidden source maps and deletion when the bundler setting is unset', () => {
      const decision = decideSourceMapHandling('unset', options(), true);

      expect(decision).toMatchObject({ enableHidden: true, deleteAfterUpload: true });
      expect(decision.log?.level).toBe('info');
    });

    it.each<SourceMapKind>(['hidden', 'visible'])('leaves a `%s` setting alone', kind => {
      expect(decideSourceMapHandling(kind, options(), true)).toEqual(NO_CHANGE);
    });

    it('warns when source maps are turned off', () => {
      const decision = decideSourceMapHandling('off', options(), true);

      expect(decision).toMatchObject(NO_CHANGE);
      expect(decision.log?.level).toBe('warn');
      expect(decision.log?.message).toMatch(/turned off/);
    });

    it('warns when source maps are inlined', () => {
      const decision = decideSourceMapHandling('inline', options(), true);

      expect(decision).toMatchObject(NO_CHANGE);
      expect(decision.log?.level).toBe('warn');
      expect(decision.log?.message).toMatch(/inlined/);
    });
  });

  describe('with the option set to true', () => {
    it('enables hidden source maps and deletion when the bundler setting is unset', () => {
      expect(decideSourceMapHandling('unset', options({ deleteSourcemapsAfterUpload: true }), true)).toMatchObject({
        enableHidden: true,
        deleteAfterUpload: true,
      });
    });

    it('deletes hidden source maps without changing the setting', () => {
      expect(decideSourceMapHandling('hidden', options({ deleteSourcemapsAfterUpload: true }), true)).toEqual({
        enableHidden: false,
        deleteAfterUpload: true,
      });
    });

    it('switches visible source maps to hidden and deletes them', () => {
      const decision = decideSourceMapHandling('visible', options({ deleteSourcemapsAfterUpload: true }), true);

      expect(decision).toMatchObject({ enableHidden: true, deleteAfterUpload: true });
      expect(decision.log?.level).toBe('info');
    });

    it.each<SourceMapKind>(['off', 'inline'])('warns and does not delete for a `%s` setting', kind => {
      const decision = decideSourceMapHandling(kind, options({ deleteSourcemapsAfterUpload: true }), true);

      expect(decision).toMatchObject(NO_CHANGE);
      expect(decision.log?.level).toBe('warn');
    });
  });

  describe('with the option set to false', () => {
    it('enables hidden source maps without deletion when the bundler setting is unset', () => {
      const decision = decideSourceMapHandling('unset', options({ deleteSourcemapsAfterUpload: false }), true);

      expect(decision).toMatchObject({ enableHidden: true, deleteAfterUpload: false });
      expect(decision.log?.level).toBe('info');
      expect(decision.log?.message).toMatch(/kept in the build output/);
    });

    it.each<SourceMapKind>(['hidden', 'visible'])('leaves a `%s` setting alone', kind => {
      expect(decideSourceMapHandling(kind, options({ deleteSourcemapsAfterUpload: false }), true)).toEqual(NO_CHANGE);
    });

    it.each<SourceMapKind>(['off', 'inline'])('still warns about a `%s` setting', kind => {
      const decision = decideSourceMapHandling(kind, options({ deleteSourcemapsAfterUpload: false }), true);

      expect(decision).toMatchObject(NO_CHANGE);
      expect(decision.log?.level).toBe('warn');
    });
  });

  it.each<SourceMapKind>(['unset', 'off', 'visible', 'hidden', 'inline'])(
    'does nothing for a `%s` setting when no upload can run',
    kind => {
      expect(decideSourceMapHandling(kind, options({ deleteSourcemapsAfterUpload: true }), false)).toEqual(NO_CHANGE);
    },
  );

  it.each([true, 'disable-upload'] as const)('does nothing when `sourcemaps.disable` is `%s`', disable => {
    expect(decideSourceMapHandling('unset', options({ disable, deleteSourcemapsAfterUpload: true }), true)).toEqual(
      NO_CHANGE,
    );
  });
});
