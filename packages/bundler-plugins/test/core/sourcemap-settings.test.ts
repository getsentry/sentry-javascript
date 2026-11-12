import { describe, it, expect } from 'vitest';
import { normalizeUserOptions } from '../../src/core/options-mapping';
import type { InternalOptions } from '../../src/core';
import { decideSourceMapHandling } from '../../src/core/sourcemap-settings';
import type { SourceMapKind } from '../../src/core/sourcemap-settings';

function options(sourcemaps?: InternalOptions['sourcemaps']) {
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
        removeAllSourceMaps: false,
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

  describe('when no upload can run', () => {
    it.each<SourceMapKind>(['unset', 'off', 'visible', 'hidden', 'inline'])(
      'does nothing for a `%s` setting with the option unset',
      kind => {
        expect(decideSourceMapHandling(kind, options(), false)).toEqual(NO_CHANGE);
      },
    );

    it.each<SourceMapKind>(['unset', 'off', 'inline'])(
      'does not turn source maps on for a `%s` setting with the option set to true',
      kind => {
        expect(decideSourceMapHandling(kind, options({ deleteSourcemapsAfterUpload: true }), false)).toEqual(NO_CHANGE);
      },
    );

    it('deletes hidden source maps with the option set to true', () => {
      const decision = decideSourceMapHandling('hidden', options({ deleteSourcemapsAfterUpload: true }), false);

      expect(decision).toMatchObject({ enableHidden: false, deleteAfterUpload: true });
      expect(decision.log?.message).toMatch(/not uploaded/);
    });

    it('switches visible source maps to hidden and deletes them with the option set to true', () => {
      expect(decideSourceMapHandling('visible', options({ deleteSourcemapsAfterUpload: true }), false)).toMatchObject({
        enableHidden: true,
        deleteAfterUpload: true,
      });
    });

    it.each([true, 'disable-upload'] as const)(
      'deletes hidden source maps when `sourcemaps.disable` is `%s` and the option is true',
      disable => {
        expect(
          decideSourceMapHandling('hidden', options({ disable, deleteSourcemapsAfterUpload: true }), true),
        ).toMatchObject({ enableHidden: false, deleteAfterUpload: true });
      },
    );

    it.each([true, 'disable-upload'] as const)(
      'does not turn source maps on when `sourcemaps.disable` is `%s`',
      disable => {
        expect(decideSourceMapHandling('unset', options({ disable, deleteSourcemapsAfterUpload: true }), true)).toEqual(
          NO_CHANGE,
        );
      },
    );
  });

  describe('with source maps the SDK turned on', () => {
    const sdkOptions = { deleteSourcemapsAfterUpload: true, sdkEnabledSourceMaps: true };

    it.each<SourceMapKind>(['hidden', 'visible'])('removes all `%s` source maps', kind => {
      expect(decideSourceMapHandling(kind, options(sdkOptions), true)).toMatchObject({
        enableHidden: kind === 'visible',
        deleteAfterUpload: true,
        removeAllSourceMaps: true,
      });
    });

    it.each<SourceMapKind>(['hidden', 'visible'])('removes all `%s` source maps when no upload can run', kind => {
      expect(decideSourceMapHandling(kind, options(sdkOptions), false)).toMatchObject({
        enableHidden: kind === 'visible',
        deleteAfterUpload: true,
        removeAllSourceMaps: true,
      });
    });

    it.each<SourceMapKind>(['unset', 'off', 'inline'])('does not turn `%s` source maps on without an upload', kind => {
      expect(decideSourceMapHandling(kind, options(sdkOptions), false)).toEqual(NO_CHANGE);
    });

    it.each([undefined, false])('keeps them when `deleteSourcemapsAfterUpload` is %s', deleteSourcemapsAfterUpload => {
      expect(
        decideSourceMapHandling('hidden', options({ deleteSourcemapsAfterUpload, sdkEnabledSourceMaps: true }), true),
      ).toEqual(NO_CHANGE);
    });

    it('calls the function form when it decides', () => {
      let value: boolean | undefined;
      const normalized = options({ deleteSourcemapsAfterUpload: true, sdkEnabledSourceMaps: () => value });

      expect(decideSourceMapHandling('hidden', normalized, true)).toMatchObject({ removeAllSourceMaps: false });
      value = true;
      expect(decideSourceMapHandling('hidden', normalized, true)).toMatchObject({ removeAllSourceMaps: true });
    });
  });

  describe('with the internal function form', () => {
    it('calls the function when it decides', () => {
      let value: boolean | undefined;
      const normalized = options({ deleteSourcemapsAfterUpload: () => value });

      expect(decideSourceMapHandling('hidden', normalized, true)).toEqual(NO_CHANGE);
      value = true;
      expect(decideSourceMapHandling('hidden', normalized, true)).toEqual({
        enableHidden: false,
        deleteAfterUpload: true,
        removeAllSourceMaps: false,
      });
    });

    it('treats `undefined` from the function like an unset option', () => {
      expect(decideSourceMapHandling('unset', options({ deleteSourcemapsAfterUpload: () => undefined }), true)).toEqual(
        decideSourceMapHandling('unset', options(), true),
      );
    });
  });
});
