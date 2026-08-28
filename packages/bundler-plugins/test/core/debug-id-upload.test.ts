import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  addDebugIdToEmittedArtifacts,
  prepareBundleForDebugIdUpload,
  stampDebugId,
  warnAboutInlineSourceMaps,
} from '../../src/core/debug-id-upload';
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

  it('does not write an upload artifact for a chunk that has no source map', async () => {
    const bundleDir = path.join(tmpDir, 'src');
    const uploadDir = path.join(tmpDir, 'upload');
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });

    const debugId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const bundlePath = path.join(bundleDir, 'stub.js');
    // A stub chunk: debug ID snippet but no code and no sourceMappingURL / adjacent `.map`.
    fs.writeFileSync(bundlePath, `"use strict";\n${debugIdSnippet(debugId)}`);

    await prepareBundleForDebugIdUpload(bundlePath, uploadDir, 0, makeLogger(), noopRewriteHook, undefined);

    expect(fs.readdirSync(uploadDir)).toEqual([]);
  });

  it('writes an upload artifact for a chunk whose source map is inlined', async () => {
    const bundleDir = path.join(tmpDir, 'src');
    const uploadDir = path.join(tmpDir, 'upload');
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });

    const debugId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const bundlePath = path.join(bundleDir, 'inline.js');
    const inlineMap = Buffer.from(JSON.stringify({ version: 3, sources: ['a.ts'], mappings: 'AAAA' })).toString(
      'base64',
    );
    fs.writeFileSync(
      bundlePath,
      `"use strict";\n// code\n${debugIdSnippet(debugId)}\n//# sourceMappingURL=data:application/json;base64,${inlineMap}`,
    );

    await prepareBundleForDebugIdUpload(bundlePath, uploadDir, 0, makeLogger(), noopRewriteHook, undefined);

    expect(fs.readdirSync(uploadDir)).toEqual([`${debugId}-0.js`]);
  });
});

describe('stampDebugId', () => {
  const debugId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const bundleSource = `"use strict";\n${debugIdSnippet(debugId)}\n//# sourceMappingURL=bundle.js.map`;
  const sourceMapSource = JSON.stringify({ version: 3, sources: ['a.ts'], mappings: 'AAAA' });
  const inlineMap = Buffer.from(sourceMapSource).toString('base64');
  const inlineBundleSource = `"use strict";\n${debugIdSnippet(debugId)}\n//# sourceMappingURL=data:application/json;base64,${inlineMap}`;

  it('stamps the debug ID from the bundle into the source map and appends the spec comment to the bundle', () => {
    const result = stampDebugId(bundleSource, sourceMapSource);

    expect(result.kind).toBe('stamped');
    expect(result).toMatchObject({ bundleSource: `${bundleSource}\n//# debugId=${debugId}` });
    expect(JSON.parse((result as { sourceMapSource: string }).sourceMapSource)).toEqual({
      version: 3,
      sources: ['a.ts'],
      mappings: 'AAAA',
      debug_id: debugId,
      debugId: debugId,
    });
  });

  it('replaces an existing spec comment instead of adding a second one', () => {
    const result = stampDebugId(`${bundleSource}\n//# debugId=00000000-0000-0000-0000-000000000000`, sourceMapSource);

    expect(result).toMatchObject({ kind: 'stamped', bundleSource: `${bundleSource}\n//# debugId=${debugId}` });
  });

  it('stamps only the bundle when the source map is inlined', () => {
    const result = stampDebugId(inlineBundleSource, undefined);

    expect(result).toEqual({
      kind: 'inline-source-map',
      bundleSource: `${inlineBundleSource}\n//# debugId=${debugId}`,
    });
  });

  it('skips a bundle without a separate or inlined source map', () => {
    expect(stampDebugId(`"use strict";\n${debugIdSnippet(debugId)}`, undefined)).toEqual({ kind: 'skipped' });
  });

  it('skips a bundle that carries no debug ID', () => {
    expect(stampDebugId('console.log(1);', sourceMapSource)).toEqual({ kind: 'skipped' });
    expect(stampDebugId('console.log(1);\n//# sourceMappingURL=data:application/json;base64,e30=', undefined)).toEqual({
      kind: 'skipped',
    });
  });

  it('skips when the source map is not valid JSON', () => {
    expect(stampDebugId(bundleSource, '{not json')).toEqual({ kind: 'skipped' });
  });

  it('skips when the source map is not an object', () => {
    expect(stampDebugId(bundleSource, '"a string"')).toEqual({ kind: 'skipped' });
  });
});

describe('addDebugIdToEmittedArtifacts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rewrites the bundle and its source map on disk', async () => {
    const debugId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const bundlePath = path.join(tmpDir, 'bundle.js');
    const mapPath = path.join(tmpDir, 'bundle.js.map');
    const bundleSource = `"use strict";\n${debugIdSnippet(debugId)}\n//# sourceMappingURL=bundle.js.map`;
    fs.writeFileSync(bundlePath, bundleSource);
    fs.writeFileSync(mapPath, JSON.stringify({ version: 3, sources: ['a.ts'], mappings: 'AAAA' }));

    const result = await addDebugIdToEmittedArtifacts(bundlePath, makeLogger(), undefined);

    expect(result).toBe('stamped');
    expect(fs.readFileSync(bundlePath, 'utf8')).toBe(`${bundleSource}\n//# debugId=${debugId}`);
    expect(JSON.parse(fs.readFileSync(mapPath, 'utf8'))).toMatchObject({ debug_id: debugId, debugId: debugId });
  });

  it('does nothing when the bundle has no source map', async () => {
    const debugId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const bundlePath = path.join(tmpDir, 'bundle.js');
    const bundleSource = `"use strict";\n${debugIdSnippet(debugId)}`;
    fs.writeFileSync(bundlePath, bundleSource);
    const logger = makeLogger();

    const result = await addDebugIdToEmittedArtifacts(bundlePath, logger, undefined);

    expect(result).toBe('skipped');
    expect(fs.readFileSync(bundlePath, 'utf8')).toBe(bundleSource);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('stamps the bundle and reports it when the source map is inlined', async () => {
    const debugId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const bundlePath = path.join(tmpDir, 'bundle.js');
    const inlineMap = Buffer.from(JSON.stringify({ version: 3, sources: ['a.ts'], mappings: 'AAAA' })).toString(
      'base64',
    );
    const bundleSource = `"use strict";\n${debugIdSnippet(debugId)}\n//# sourceMappingURL=data:application/json;base64,${inlineMap}`;
    fs.writeFileSync(bundlePath, bundleSource);

    const result = await addDebugIdToEmittedArtifacts(bundlePath, makeLogger(), undefined);

    expect(result).toBe('inline-source-map');
    expect(fs.readFileSync(bundlePath, 'utf8')).toBe(`${bundleSource}\n//# debugId=${debugId}`);
  });

  it('leaves a bundle with an inlined source map but no debug ID untouched', async () => {
    const bundlePath = path.join(tmpDir, 'bundle.js');
    const inlineMap = Buffer.from(JSON.stringify({ version: 3, sources: ['a.ts'], mappings: 'AAAA' })).toString(
      'base64',
    );
    const bundleSource = `"use strict";\n//# sourceMappingURL=data:application/json;base64,${inlineMap}`;
    fs.writeFileSync(bundlePath, bundleSource);

    const result = await addDebugIdToEmittedArtifacts(bundlePath, makeLogger(), undefined);

    expect(result).toBe('skipped');
    expect(fs.readFileSync(bundlePath, 'utf8')).toBe(bundleSource);
  });
});

describe('warnAboutInlineSourceMaps', () => {
  it('does not warn when no bundle inlines its source map', () => {
    const logger = makeLogger();

    warnAboutInlineSourceMaps([], logger);

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns once, listing the affected bundles', () => {
    const logger = makeLogger();

    warnAboutInlineSourceMaps(['a.js', 'b.js'], logger);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('2 bundle(s) inline their source map'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('a.js, b.js'));
  });
});
