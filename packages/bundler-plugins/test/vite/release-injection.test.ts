import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runInNewContext } from 'node:vm';
import { build, createBuilder } from 'vite';
import type { InlineConfig } from 'vite';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentryVitePlugin } from '../../src/vite';
import type { Options } from '../../src/core';

const RELEASE_SNIPPET = /SENTRY_RELEASE\s*=\s*\{\s*id:\s*"1\.2\.3"\s*\}/;
const INLINE_SCRIPT = /<script(?<attributes>[^>]*)>(?<code>[^<]*SENTRY_RELEASE[^<]*)<\/script>/;

function listJsFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(file => file.endsWith('.js'))
    .sort();
}

describe('release injection (vite)', () => {
  let root: string;
  let outDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-vite-release-injection-'));
    outDir = path.join(root, 'dist');
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<!doctype html><html><head><meta charset="UTF-8"></head><body><script type="module" src="/main.js"></script></body></html>',
    );
    fs.writeFileSync(
      path.join(root, 'main.js'),
      'import { shared } from "./shared.js";\nconsole.log("main", shared);\nimport("./route.js");\n',
    );
    fs.writeFileSync(path.join(root, 'shared.js'), 'export const shared = "shared";\n');
    fs.writeFileSync(
      path.join(root, 'route.js'),
      'import { shared } from "./shared.js";\nconsole.log("route", shared);\n',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function buildApp(pluginOptions: Options, overrides: InlineConfig = {}): Promise<void> {
    await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: sentryVitePlugin({
        telemetry: false,
        silent: true,
        ...pluginOptions,
        release: { create: false, ...pluginOptions.release },
      }),
      ...overrides,
      build: { outDir, emptyOutDir: true, minify: false, ...overrides.build },
    });
  }

  function readHtml(): string {
    return fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  }

  function readJs(): string[] {
    return listJsFiles(outDir).map(file => fs.readFileSync(path.join(outDir, file), 'utf8'));
  }

  it("with 'html', injects the release into the HTML page and not into any chunk", async () => {
    await buildApp({ release: { name: '1.2.3', inject: 'html' } });

    const script = readHtml().match(INLINE_SCRIPT);
    expect(script).not.toBeNull();
    const context: { SENTRY_RELEASE?: unknown } = {};
    runInNewContext(script?.groups?.code ?? '', context);
    expect(context.SENTRY_RELEASE).toEqual({ id: '1.2.3' });

    const chunks = readJs();
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk).not.toContain('SENTRY_RELEASE');
    }
  });

  it("with 'html', puts the build information into the HTML page too", async () => {
    await buildApp({
      release: { name: '1.2.3', inject: 'html' },
      _experiments: { injectBuildInformation: true },
    });

    expect(readHtml().match(INLINE_SCRIPT)?.groups?.code).toContain('SENTRY_BUILD_INFO');
    for (const chunk of readJs()) {
      expect(chunk).not.toContain('SENTRY_BUILD_INFO');
    }
  });

  it("with 'html', keeps JS file names the same when only the release changes", async () => {
    await buildApp({ release: { name: 'release-a', inject: 'html' } });
    const firstNames = listJsFiles(outDir);
    await buildApp({ release: { name: 'release-b', inject: 'html' } });

    expect(listJsFiles(outDir)).toEqual(firstNames);
    expect(readHtml()).toContain('release-b');
  });

  it('by default, injects the release into chunks, which changes their file names', async () => {
    await buildApp({ release: { name: 'release-a' } });
    const firstNames = listJsFiles(outDir);
    await buildApp({ release: { name: 'release-b' } });

    expect(listJsFiles(outDir)).not.toEqual(firstNames);
    expect(readHtml()).not.toContain('SENTRY_RELEASE');
  });

  it("with 'html', gives the script Vite's CSP nonce", async () => {
    await buildApp({ release: { name: '1.2.3', inject: 'html' } }, { html: { cspNonce: 'abc123' } });

    expect(readHtml().match(INLINE_SCRIPT)?.groups?.attributes).toContain('nonce="abc123"');
  });

  it("with 'html' and no HTML entry point, warns and injects the release into the startup chunk", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await buildApp(
      { silent: false, release: { name: '1.2.3', inject: 'html' } },
      { build: { rollupOptions: { input: path.join(root, 'main.js') } } },
    );

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("`release.inject: 'html'` needs a build with HTML"));
    const mainChunk = readJs().find(chunk => chunk.includes('"main"'));
    expect(mainChunk).toMatch(RELEASE_SNIPPET);
  });

  it.each([
    ['client', 'ssr'],
    ['ssr', 'client'],
  ])("with 'html', decides per environment when %s and %s build in parallel", async (...order) => {
    const serverOutDir = path.join(root, 'dist-server');
    fs.writeFileSync(path.join(root, 'server.js'), 'console.log("server");\n');

    const builder = await createBuilder({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: sentryVitePlugin({
        telemetry: false,
        silent: true,
        release: { name: '1.2.3', inject: 'html', create: false },
      }),
      environments: {
        client: { build: { outDir, emptyOutDir: true, minify: false } },
        ssr: { build: { outDir: serverOutDir, emptyOutDir: true, ssr: path.join(root, 'server.js'), minify: false } },
      },
      builder: {
        buildApp: async appBuilder => {
          await Promise.all(order.map(name => appBuilder.build(appBuilder.environments[name]!)));
        },
      },
    });
    await builder.buildApp();

    expect(readHtml()).toMatch(RELEASE_SNIPPET);
    expect(fs.readFileSync(path.join(serverOutDir, 'server.mjs'), 'utf8')).toMatch(RELEASE_SNIPPET);
    for (const chunk of readJs()) {
      expect(chunk).not.toContain('SENTRY_RELEASE');
    }
  });

  it('with false, injects the release nowhere', async () => {
    await buildApp({ release: { name: '1.2.3', inject: false } });

    expect(readHtml()).not.toContain('SENTRY_RELEASE');
    for (const chunk of readJs()) {
      expect(chunk).not.toContain('SENTRY_RELEASE');
    }
  });
});
