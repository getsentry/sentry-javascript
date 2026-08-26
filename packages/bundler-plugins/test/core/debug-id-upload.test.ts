import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { prepareBundleForDebugIdUpload, stampDebugIdOnEmittedSourceMap } from '../../src/core/debug-id-upload';
import type { RewriteSourcesHook } from '../../src/core/types';
import type { Logger } from '../../src/core';

const debugIdSnippet = (debugId: string): string =>
  `;!function(){try{var e="undefined"!=typeof window?window:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="${debugId}",e._sentryDebugIdIdentifier="sentry-dbid-${debugId}")}catch(e){}}();`;

const makeLogger = (): Logger =>
  ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as unknown as Logger;

describe('prepareBundleForDebugIdUpload', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes mapDir context to rewriteSources hook', async () => {
    const bundleDir = path.join(tmpDir, 'src');
    const uploadDir = path.join(tmpDir, 'upload');
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });

    const debugId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const bundlePath = path.join(bundleDir, 'bundle.js');
    const mapPath = path.join(bundleDir, 'bundle.js.map');

    // Bundle with debug ID snippet and sourceMappingURL
    fs.writeFileSync(
      bundlePath,
      `"use strict";\n// some code\n;!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="${debugId}",e._sentryDebugIdIdentifier="sentry-dbid-${debugId}")}catch(e){}}();\n//# sourceMappingURL=bundle.js.map`,
    );

    // Source map file
    fs.writeFileSync(
      mapPath,
      JSON.stringify({
        version: 3,
        sources: ['../original/file.ts'],
        mappings: 'AAAA',
      }),
    );

    const capturedContexts: Array<{ mapDir?: string } | undefined> = [];
    const rewriteHook: RewriteSourcesHook = (source, _map, context) => {
      capturedContexts.push(context);
      return source;
    };

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    await prepareBundleForDebugIdUpload(bundlePath, uploadDir, 0, logger as Logger, rewriteHook, undefined);

    expect(capturedContexts).toHaveLength(1);
    expect(capturedContexts[0]!.mapDir).toBe(bundleDir);
  });

  const noopRewriteHook: RewriteSourcesHook = source => source;

  // An array passed the old parse-and-mutate guard (arrays take string keys), then serialized back to
  // `[]` - uploading a map that looks fine to the CLI and symbolicates nothing.
  it.each(['null', '42', '[]'])('does not upload a source map that is %s', async mapContent => {
    const bundleDir = path.join(tmpDir, 'src');
    const uploadDir = path.join(tmpDir, 'upload');
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });

    const debugId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const bundlePath = path.join(bundleDir, 'bundle.js');
    fs.writeFileSync(bundlePath, `"use strict";\n// code\n${debugIdSnippet(debugId)}`);
    fs.writeFileSync(path.join(bundleDir, 'bundle.js.map'), mapContent);
    const logger = makeLogger();

    await prepareBundleForDebugIdUpload(bundlePath, uploadDir, 0, logger, noopRewriteHook, undefined);

    expect(fs.readdirSync(uploadDir)).toEqual([`${debugId}-0.js`]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Source map is not a JSON object'));
  });
});

describe('stampDebugIdOnEmittedSourceMap', () => {
  const debugId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeBundle(fileName: string, { sourceMappingUrl }: { sourceMappingUrl?: string } = {}): string {
    const bundlePath = path.join(tmpDir, fileName);
    const sourceMappingUrlComment = sourceMappingUrl ? `\n//# sourceMappingURL=${sourceMappingUrl}` : '';
    fs.writeFileSync(bundlePath, `"use strict";\n// code\n${debugIdSnippet(debugId)}${sourceMappingUrlComment}`);
    return bundlePath;
  }

  function writeSourceMap(fileName: string, map: Record<string, unknown> = {}): string {
    const mapPath = path.join(tmpDir, fileName);
    fs.writeFileSync(mapPath, JSON.stringify({ version: 3, sources: ['../src/index.ts'], mappings: 'AAAA', ...map }));
    return mapPath;
  }

  function readSourceMap(mapPath: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(mapPath, 'utf8')) as Record<string, unknown>;
  }

  it('writes the bundle’s debug ID into the adjacent source map', async () => {
    // `hidden-source-map` emits no sourceMappingURL comment, so the `.map` sibling is the only way to find the map
    const bundlePath = writeBundle('bundle.js');
    const mapPath = writeSourceMap('bundle.js.map');

    await stampDebugIdOnEmittedSourceMap(bundlePath, makeLogger(), undefined);

    expect(readSourceMap(mapPath)).toMatchObject({ debug_id: debugId, debugId });
  });

  it('follows the sourceMappingURL comment', async () => {
    const bundlePath = writeBundle('bundle.js', { sourceMappingUrl: 'maps/bundle.map' });
    fs.mkdirSync(path.join(tmpDir, 'maps'));
    const mapPath = writeSourceMap(path.join('maps', 'bundle.map'));

    await stampDebugIdOnEmittedSourceMap(bundlePath, makeLogger(), undefined);

    expect(readSourceMap(mapPath)).toMatchObject({ debug_id: debugId, debugId });
  });

  it('leaves the bundle untouched so build-time hashes stay valid', async () => {
    const bundlePath = writeBundle('bundle.js');
    writeSourceMap('bundle.js.map');
    const bundleContentBefore = fs.readFileSync(bundlePath, 'utf8');

    await stampDebugIdOnEmittedSourceMap(bundlePath, makeLogger(), undefined);

    expect(fs.readFileSync(bundlePath, 'utf8')).toBe(bundleContentBefore);
  });

  it('does not rewrite the source map’s sources', async () => {
    const bundlePath = writeBundle('bundle.js');
    const mapPath = writeSourceMap('bundle.js.map', { sources: ['webpack://app/./src/index.ts'] });

    await stampDebugIdOnEmittedSourceMap(bundlePath, makeLogger(), undefined);

    expect(readSourceMap(mapPath)).toMatchObject({ sources: ['webpack://app/./src/index.ts'] });
  });

  it('uses the resolveSourceMap hook when provided', async () => {
    const bundlePath = writeBundle('bundle.js');
    const mapPath = writeSourceMap('somewhere-else.map');

    await stampDebugIdOnEmittedSourceMap(bundlePath, makeLogger(), () => mapPath);

    expect(readSourceMap(mapPath)).toMatchObject({ debug_id: debugId, debugId });
  });

  it('reports a stamped source map', async () => {
    const bundlePath = writeBundle('bundle.js');
    writeSourceMap('bundle.js.map');

    await expect(stampDebugIdOnEmittedSourceMap(bundlePath, makeLogger(), undefined)).resolves.toBe('stamped');
  });

  it('does not rewrite a source map that is already stamped', async () => {
    const bundlePath = writeBundle('bundle.js');
    const mapPath = writeSourceMap('bundle.js.map', { debug_id: debugId, debugId });
    const mtimeBefore = fs.statSync(mapPath).mtimeMs;

    await expect(stampDebugIdOnEmittedSourceMap(bundlePath, makeLogger(), undefined)).resolves.toBe('alreadyStamped');

    expect(fs.statSync(mapPath).mtimeMs).toBe(mtimeBefore);
  });

  it('logs and skips bundles without an injected debug ID', async () => {
    const bundlePath = path.join(tmpDir, 'bundle.js');
    fs.writeFileSync(bundlePath, '"use strict";\n// code');
    const mapPath = writeSourceMap('bundle.js.map');
    const logger = makeLogger();

    await expect(stampDebugIdOnEmittedSourceMap(bundlePath, logger, undefined)).resolves.toBe('skipped');

    expect(readSourceMap(mapPath)).not.toHaveProperty('debug_id');
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Could not determine debug ID'));
  });

  it('does not throw when no source map can be found', async () => {
    const bundlePath = writeBundle('bundle.js');

    await expect(stampDebugIdOnEmittedSourceMap(bundlePath, makeLogger(), undefined)).resolves.toBe('skipped');
  });

  // An inlined map cannot be stamped without rewriting the bundle, so the caller has to be able to
  // tell this apart from "nothing to do" and warn the user that these bundles will not symbolicate.
  it('reports bundles whose source map is inlined as a data URI', async () => {
    const bundlePath = path.join(tmpDir, 'bundle.js');
    const inlineMap = Buffer.from(JSON.stringify({ version: 3, sources: [], mappings: '' })).toString('base64');
    fs.writeFileSync(
      bundlePath,
      `"use strict";\n${debugIdSnippet(debugId)}\n//# sourceMappingURL=data:application/json;base64,${inlineMap}`,
    );

    await expect(stampDebugIdOnEmittedSourceMap(bundlePath, makeLogger(), undefined)).resolves.toBe('inlineSourceMap');
  });

  it('logs and skips source maps that cannot be parsed', async () => {
    const bundlePath = writeBundle('bundle.js');
    const mapPath = path.join(tmpDir, 'bundle.js.map');
    fs.writeFileSync(mapPath, 'not json');
    const logger = makeLogger();

    await expect(stampDebugIdOnEmittedSourceMap(bundlePath, logger, undefined)).resolves.toBe('skipped');

    expect(fs.readFileSync(mapPath, 'utf8')).toBe('not json');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse source map'), expect.anything());
  });

  // `JSON.parse` happily returns non-objects, so indexing the result without a guard would throw a
  // TypeError out of the stamping run and take the whole build's error handler with it.
  it.each(['null', '42', '"a string"', '[]'])('logs and skips a source map that is %s', async mapContent => {
    const bundlePath = writeBundle('bundle.js');
    const mapPath = path.join(tmpDir, 'bundle.js.map');
    fs.writeFileSync(mapPath, mapContent);
    const logger = makeLogger();

    await expect(stampDebugIdOnEmittedSourceMap(bundlePath, logger, undefined)).resolves.toBe('skipped');

    expect(fs.readFileSync(mapPath, 'utf8')).toBe(mapContent);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Source map is not a JSON object'));
  });
});
