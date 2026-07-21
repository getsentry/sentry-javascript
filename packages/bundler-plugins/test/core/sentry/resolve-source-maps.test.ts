import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';
import { determineSourceMapPathFromBundle } from '../../../src/core/debug-id-upload';
import { createLogger } from '../../../src/core/logger';
import { describe, it, expect, vi } from 'vitest';

const logger = createLogger({ prefix: '[resolve-source-maps-test]', silent: false, debug: false });
const fixtureDir = path.resolve(__dirname, '../fixtures/resolve-source-maps');

const adjacentBundlePath = path.join(fixtureDir, 'adjacent-sourcemap/index.js');
const adjacentSourceMapPath = path.join(fixtureDir, 'adjacent-sourcemap/index.js.map');
const adjacentBundleContent = fs.readFileSync(adjacentBundlePath, 'utf-8');

const separateBundlePath = path.join(fixtureDir, 'separate-directory/bundles/index.js');
const separateSourceMapPath = path.join(fixtureDir, 'separate-directory/sourcemaps/index.js.map');
const separateBundleContent = fs.readFileSync(separateBundlePath, 'utf-8');

const sourceMapUrl = 'https://sourcemaps.example.com/foo/index.js.map';

function srcMappingUrl(url: string): string {
  return `\n//# sourceMappingURL=${url}`;
}

describe('Resolve source maps', () => {
  it('should resolve source maps next to bundles', async () => {
    expect(
      await determineSourceMapPathFromBundle(adjacentBundlePath, adjacentBundleContent, logger, undefined),
    ).toEqual(adjacentSourceMapPath);
  });

  it("shouldn't resolve source maps in separate directories", async () => {
    expect(
      await determineSourceMapPathFromBundle(separateBundlePath, separateBundleContent, logger, undefined),
    ).toBeUndefined();
  });

  describe('sourceMappingURL resolution', () => {
    it('should resolve source maps when sourceMappingURL is a file URL', async () => {
      expect(
        await determineSourceMapPathFromBundle(
          separateBundlePath,
          separateBundleContent + srcMappingUrl(url.pathToFileURL(separateSourceMapPath).href),
          logger,
          undefined,
        ),
      ).toEqual(separateSourceMapPath);
    });

    it("shouldn't resolve source maps when sourceMappingURL is a non-file URL", async () => {
      expect(
        await determineSourceMapPathFromBundle(
          separateBundlePath,
          separateBundleContent + srcMappingUrl(sourceMapUrl),
          logger,
          undefined,
        ),
      ).toBeUndefined();
    });

    it('should resolve source maps when sourceMappingURL is an absolute path', async () => {
      expect(
        await determineSourceMapPathFromBundle(
          separateBundlePath,
          separateBundleContent + srcMappingUrl(separateSourceMapPath),
          logger,
          undefined,
        ),
      ).toEqual(separateSourceMapPath);
    });

    it('should resolve source maps when sourceMappingURL is a relative path', async () => {
      expect(
        await determineSourceMapPathFromBundle(
          separateBundlePath,
          separateBundleContent + srcMappingUrl(path.relative(path.dirname(separateBundlePath), separateSourceMapPath)),
          logger,
          undefined,
        ),
      ).toEqual(separateSourceMapPath);
    });
  });

  describe('resolveSourceMap hook', () => {
    it('should resolve source maps when a resolveSourceMap hook is provided', async () => {
      expect(
        await determineSourceMapPathFromBundle(
          separateBundlePath,
          separateBundleContent + srcMappingUrl(sourceMapUrl),
          logger,
          () => separateSourceMapPath,
        ),
      ).toEqual(separateSourceMapPath);
    });

    it('should pass the correct values to the resolveSourceMap hook', async () => {
      const hook = vi.fn(() => separateSourceMapPath);
      expect(
        await determineSourceMapPathFromBundle(
          separateBundlePath,
          separateBundleContent + srcMappingUrl(sourceMapUrl),
          logger,
          hook,
        ),
      ).toEqual(separateSourceMapPath);
      expect(hook.mock.calls[0]).toEqual([separateBundlePath, sourceMapUrl]);
    });

    it('should pass the correct values to the resolveSourceMap hook when no sourceMappingURL is present', async () => {
      const hook = vi.fn(() => separateSourceMapPath);
      expect(await determineSourceMapPathFromBundle(separateBundlePath, separateBundleContent, logger, hook)).toEqual(
        separateSourceMapPath,
      );
      expect(hook.mock.calls[0]).toEqual([separateBundlePath, undefined]);
    });

    it('should prefer resolveSourceMap result over heuristic results', async () => {
      expect(
        await determineSourceMapPathFromBundle(
          adjacentBundlePath,
          adjacentBundleContent,
          logger,
          () => separateSourceMapPath,
        ),
      ).toEqual(separateSourceMapPath);
    });

    it('should fall back when the resolveSourceMap hook returns undefined', async () => {
      expect(
        await determineSourceMapPathFromBundle(adjacentBundlePath, adjacentBundleContent, logger, () => undefined),
      ).toEqual(adjacentSourceMapPath);
    });

    it('should fall back when the resolveSourceMap hook returns a non-existent path', async () => {
      expect(
        await determineSourceMapPathFromBundle(adjacentBundlePath, adjacentBundleContent, logger, () =>
          path.join(fixtureDir, 'non-existent.js.map'),
        ),
      ).toEqual(adjacentSourceMapPath);
    });
  });
});
