import { describe, it, expect } from 'vitest';
import { normalizeUserOptions } from '../../src/core/options-mapping';
import type { InternalOptions } from '../../src/core';
import { decideSourceMapHandling, getDeleteOption, getSourceMapFeatures } from '../../src/core/sourcemap-settings';
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
      'keeps source maps and warns when `sourcemaps.disable` is `%s` and the option is true',
      disable => {
        for (const kind of ['hidden', 'visible'] as const) {
          const decision = decideSourceMapHandling(kind, options({ disable, deleteSourcemapsAfterUpload: true }), true);

          expect(decision).toMatchObject(NO_CHANGE);
          expect(decision.log?.level).toBe('warn');
          expect(decision.log?.message).toMatch(/sourcemaps\.disable/);
        }
      },
    );

    it.each([true, 'disable-upload'] as const)(
      'removes source maps the SDK turned on when `sourcemaps.disable` is `%s`',
      disable => {
        expect(decideSourceMapHandling('hidden', options({ disable, sdkDeleteSourceMaps: true }), true)).toMatchObject({
          enableHidden: false,
          deleteAfterUpload: true,
          removeAllSourceMaps: true,
        });
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

  describe('with `sdkDeleteSourceMaps`', () => {
    const sdkOptions = { sdkDeleteSourceMaps: true };

    it.each<SourceMapKind>(['hidden', 'visible'])('removes all `%s` source maps', kind => {
      expect(decideSourceMapHandling(kind, options(sdkOptions), true)).toMatchObject({
        enableHidden: kind === 'visible',
        deleteAfterUpload: true,
        removeAllSourceMaps: true,
      });
    });

    it.each<SourceMapKind>(['hidden', 'visible'])('removes all `%s` source maps when no upload can run', kind => {
      const decision = decideSourceMapHandling(kind, options(sdkOptions), false);

      expect(decision).toEqual({
        enableHidden: kind === 'visible',
        deleteAfterUpload: true,
        removeAllSourceMaps: true,
        log: {
          level: 'info',
          message: 'Source maps are not uploaded, but the Sentry SDK removes them from the build output.',
        },
      });
    });

    it('names the SDK when it switches visible source maps to hidden', () => {
      expect(decideSourceMapHandling('visible', options(sdkOptions), true).log).toEqual({
        level: 'info',
        message:
          'Switching to hidden source maps, because the Sentry SDK removes them from the build output. ' +
          'Without the `sourceMappingURL` comment browsers do not request the removed map files.',
      });
    });

    it.each<SourceMapKind>(['unset', 'off', 'inline'])('does not turn `%s` source maps on without an upload', kind => {
      expect(decideSourceMapHandling(kind, options(sdkOptions), false)).toEqual(NO_CHANGE);
    });

    it.each<SourceMapKind>(['hidden', 'visible'])('keeps `%s` source maps when it is `false`', kind => {
      expect(decideSourceMapHandling(kind, options({ sdkDeleteSourceMaps: false }), true)).toEqual(NO_CHANGE);
    });

    it('keeps the source maps the plugin turns on when it is `false`', () => {
      expect(decideSourceMapHandling('unset', options({ sdkDeleteSourceMaps: false }), true)).toMatchObject({
        enableHidden: true,
        deleteAfterUpload: false,
      });
    });

    it('lets the user-set `deleteSourcemapsAfterUpload` win', () => {
      expect(
        decideSourceMapHandling(
          'hidden',
          options({ deleteSourcemapsAfterUpload: false, sdkDeleteSourceMaps: true }),
          true,
        ),
      ).toEqual(NO_CHANGE);
      expect(
        decideSourceMapHandling(
          'hidden',
          options({ deleteSourcemapsAfterUpload: true, sdkDeleteSourceMaps: false }),
          true,
        ),
      ).toEqual({ enableHidden: false, deleteAfterUpload: true, removeAllSourceMaps: false });
    });

    it('names `deleteSourcemapsAfterUpload` in the logs when the user set it to `true`', () => {
      const userOptions = options({ deleteSourcemapsAfterUpload: true, sdkDeleteSourceMaps: true });

      expect(decideSourceMapHandling('hidden', userOptions, false).log).toEqual({
        level: 'warn',
        message:
          'Source maps are not uploaded, but they are removed from the build output because `sourcemaps.deleteSourcemapsAfterUpload` is set.',
      });
      expect(decideSourceMapHandling('visible', userOptions, true).log?.message).toMatch(
        /^Switching to hidden source maps because `sourcemaps\.deleteSourcemapsAfterUpload` is set\./,
      );
    });

    it('calls the function form when it decides', () => {
      let value: boolean | undefined;
      const normalized = options({ sdkDeleteSourceMaps: () => value });

      expect(decideSourceMapHandling('hidden', normalized, true)).toEqual(NO_CHANGE);
      value = true;
      expect(decideSourceMapHandling('hidden', normalized, true)).toEqual({
        enableHidden: false,
        deleteAfterUpload: true,
        removeAllSourceMaps: true,
      });
    });

    it('passes the environment to the function', () => {
      const normalized = options({ sdkDeleteSourceMaps: environment => environment === 'client' || undefined });

      expect(decideSourceMapHandling('hidden', normalized, true, 'client')).toMatchObject({
        deleteAfterUpload: true,
        removeAllSourceMaps: true,
      });
      expect(decideSourceMapHandling('hidden', normalized, true, 'nitro')).toEqual(NO_CHANGE);
      expect(decideSourceMapHandling('hidden', normalized, true)).toEqual(NO_CHANGE);
    });

    it('treats `undefined` from the function like an unset option', () => {
      expect(decideSourceMapHandling('unset', options({ sdkDeleteSourceMaps: () => undefined }), true)).toEqual(
        decideSourceMapHandling('unset', options(), true),
      );
    });
  });
});

describe('getSourceMapFeatures', () => {
  it.each([
    [undefined, { injectDebugIds: true, upload: true }],
    [{ disable: false }, { injectDebugIds: true, upload: true }],
    [{ disable: true }, { injectDebugIds: false, upload: false }],
    [{ disable: 'disable-upload' }, { injectDebugIds: true, upload: false }],
    [{ upload: true }, { injectDebugIds: true, upload: true }],
    [{ upload: false }, { injectDebugIds: true, upload: false }],
    [{ injectDebugIds: true }, { injectDebugIds: true, upload: true }],
    [{ injectDebugIds: false }, { injectDebugIds: false, upload: false }],
    [
      { upload: false, injectDebugIds: false },
      { injectDebugIds: false, upload: false },
    ],
    [
      { upload: true, injectDebugIds: false },
      { injectDebugIds: false, upload: false },
    ],
  ] as const)('reads %j', (sourcemaps, expected) => {
    expect(getSourceMapFeatures(options(sourcemaps))).toEqual({
      ...expected,
      stampEmittedFiles: expected.injectDebugIds && !expected.upload,
    });
  });

  it.each([
    [
      { upload: true, disable: true },
      { injectDebugIds: true, upload: true },
    ],
    [
      { upload: false, disable: true },
      { injectDebugIds: true, upload: false },
    ],
    [
      { injectDebugIds: true, disable: 'disable-upload' },
      { injectDebugIds: true, upload: true },
    ],
    [
      { injectDebugIds: false, disable: false },
      { injectDebugIds: false, upload: false },
    ],
  ] as const)('ignores `sourcemaps.disable` when a new option is set: %j', (sourcemaps, expected) => {
    expect(getSourceMapFeatures(options(sourcemaps))).toEqual({
      ...expected,
      stampEmittedFiles: expected.injectDebugIds && !expected.upload,
    });
  });
});

describe('getDeleteOption', () => {
  it('reads `sourcemaps.deleteSourcemapsAfterUpload` when `sourcemaps.delete` is unset', () => {
    expect(getDeleteOption(options())).toBeUndefined();
    expect(getDeleteOption(options({ deleteSourcemapsAfterUpload: true }))).toBe(true);
  });

  it('reads `sourcemaps.sdkDeleteSourceMaps` when both user options are unset', () => {
    const sdkDeleteSourceMaps = (environment?: string): boolean | undefined => environment === 'client' || undefined;

    expect(getDeleteOption(options({ sdkDeleteSourceMaps }), 'client')).toBe(true);
    expect(getDeleteOption(options({ sdkDeleteSourceMaps }), 'ssr')).toBeUndefined();
    expect(getDeleteOption(options({ deleteSourcemapsAfterUpload: false, sdkDeleteSourceMaps }), 'client')).toBe(false);
  });

  it.each([true, false])('prefers `sourcemaps.delete: %s`', value => {
    expect(getDeleteOption(options({ delete: value, deleteSourcemapsAfterUpload: !value }))).toBe(value);
  });
});

describe('decideSourceMapHandling with `sourcemaps.upload` and `sourcemaps.injectDebugIds`', () => {
  it.each([{ upload: false }, { injectDebugIds: false }, { upload: false, injectDebugIds: false }])(
    'turns no source maps on with %j',
    sourcemaps => {
      for (const kind of ['unset', 'off', 'visible', 'hidden', 'inline'] as const) {
        expect(decideSourceMapHandling(kind, options(sourcemaps), false)).toEqual(NO_CHANGE);
      }
    },
  );

  it('keeps source maps and names the new options when `deleteSourcemapsAfterUpload` is true', () => {
    const decision = decideSourceMapHandling(
      'hidden',
      options({ upload: false, deleteSourcemapsAfterUpload: true }),
      false,
    );

    expect(decision).toMatchObject(NO_CHANGE);
    expect(decision.log?.message).toMatch(/sourcemaps\.upload/);
  });
});

describe('decideSourceMapHandling with `sourcemaps.delete`', () => {
  describe('set to true', () => {
    it('enables hidden source maps and removes all of them when the bundler setting is unset', () => {
      expect(decideSourceMapHandling('unset', options({ delete: true }), true)).toMatchObject({
        enableHidden: true,
        deleteAfterUpload: true,
        removeAllSourceMaps: true,
      });
    });

    it('does not turn source maps on when no upload can run', () => {
      expect(decideSourceMapHandling('unset', options({ delete: true }), false)).toEqual(NO_CHANGE);
    });

    it.each([true, false])('removes all hidden source maps (upload can run: %s)', uploadPossible => {
      expect(decideSourceMapHandling('hidden', options({ delete: true }), uploadPossible)).toMatchObject({
        enableHidden: false,
        deleteAfterUpload: true,
        removeAllSourceMaps: true,
      });
    });

    it.each([true, false])(
      'switches visible source maps to hidden and removes them (upload can run: %s)',
      uploadPossible => {
        expect(decideSourceMapHandling('visible', options({ delete: true }), uploadPossible)).toMatchObject({
          enableHidden: true,
          deleteAfterUpload: true,
          removeAllSourceMaps: true,
        });
      },
    );

    it.each([{ upload: false }, { injectDebugIds: false }, { disable: true }, { disable: 'disable-upload' }] as const)(
      'removes source maps the user enabled and warns with %j',
      sourcemaps => {
        const decision = decideSourceMapHandling('hidden', options({ ...sourcemaps, delete: true }), false);

        expect(decision).toMatchObject({ deleteAfterUpload: true, removeAllSourceMaps: true });
        expect(decision.log?.level).toBe('warn');
        expect(decision.log?.message).toMatch(/not uploaded/);
      },
    );

    it.each<SourceMapKind>(['off', 'inline'])('warns and does not delete for a `%s` setting', kind => {
      const decision = decideSourceMapHandling(kind, options({ delete: true }), true);

      expect(decision).toMatchObject(NO_CHANGE);
      expect(decision.log?.level).toBe('warn');
    });

    it('wins over `deleteSourcemapsAfterUpload: false`', () => {
      expect(
        decideSourceMapHandling('hidden', options({ delete: true, deleteSourcemapsAfterUpload: false }), true),
      ).toMatchObject({ deleteAfterUpload: true });
    });
  });

  describe('set to false', () => {
    it.each([true, false])(
      'enables hidden source maps and keeps them when the bundler setting is unset (upload can run: %s)',
      uploadPossible => {
        expect(decideSourceMapHandling('unset', options({ delete: false }), uploadPossible)).toMatchObject({
          enableHidden: true,
          deleteAfterUpload: false,
        });
      },
    );

    it('enables hidden source maps and keeps them for a manual upload with `upload: false`', () => {
      const decision = decideSourceMapHandling('unset', options({ upload: false, delete: false }), false);

      expect(decision).toMatchObject({ enableHidden: true, deleteAfterUpload: false });
      expect(decision.log?.message).toMatch(/not uploaded/);
    });

    it('does not turn source maps on with `injectDebugIds: false`', () => {
      expect(decideSourceMapHandling('unset', options({ injectDebugIds: false, delete: false }), false)).toEqual(
        NO_CHANGE,
      );
    });

    it.each<SourceMapKind>(['hidden', 'visible'])('leaves a `%s` setting alone', kind => {
      expect(decideSourceMapHandling(kind, options({ delete: false }), true)).toEqual(NO_CHANGE);
      expect(decideSourceMapHandling(kind, options({ delete: false }), false)).toEqual(NO_CHANGE);
    });

    it('wins over `deleteSourcemapsAfterUpload: true` and source maps the SDK turned on', () => {
      expect(
        decideSourceMapHandling(
          'hidden',
          options({ delete: false, deleteSourcemapsAfterUpload: true, sdkDeleteSourceMaps: true }),
          true,
        ),
      ).toEqual(NO_CHANGE);
    });
  });
});
