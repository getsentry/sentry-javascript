import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runInNewContext } from 'node:vm';
import { Compilation, sources, webpack } from 'webpack';
import type { Compiler, Configuration, Stats } from 'webpack';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentryWebpackPlugin } from '../../src/webpack/index';

const RELEASE_SNIPPET = /SENTRY_RELEASE\s*=\s*\{\s*id:\s*"1\.2\.3"\s*\}/;
const DEBUG_ID_MARKER = /sentry-dbid-[0-9a-f-]{36}/;
const INLINE_SCRIPT = /<script>(?<code>[^<]*SENTRY_RELEASE[^<]*)<\/script>/;

type TagObject = { tagName: string; attributes: Record<string, string | boolean>; innerHTML?: string };
type TagGroups = { headTags: TagObject[]; bodyTags: TagObject[] };
type TagGroupsCallback = (data: TagGroups) => TagGroups;

/**
 * Stands in for `html-webpack-plugin`, which is not a dependency of this package. Mirrors the
 * parts of its API the Sentry plugin uses: the static `getHooks(compilation)` with an
 * `alterAssetTagGroups` waterfall hook, called before the page is rendered.
 */
class HtmlWebpackPlugin {
  private static readonly _hooks = new WeakMap<Compilation, { alterAssetTagGroups: { taps: TagGroupsCallback[] } }>();

  public static getHooks(compilation: Compilation): {
    alterAssetTagGroups: { tap: (name: string, cb: TagGroupsCallback) => void };
  } {
    let hooks = HtmlWebpackPlugin._hooks.get(compilation);
    if (!hooks) {
      hooks = { alterAssetTagGroups: { taps: [] } };
      HtmlWebpackPlugin._hooks.set(compilation, hooks);
    }
    const { taps } = hooks.alterAssetTagGroups;
    return { alterAssetTagGroups: { tap: (_name, cb) => taps.push(cb) } };
  }

  public apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap('HtmlWebpackPlugin', compilation => {
      compilation.hooks.processAssets.tap(
        { name: 'HtmlWebpackPlugin', stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE },
        () => {
          const scripts = [...(compilation.entrypoints.get('main')?.getFiles() ?? [])];
          let groups: TagGroups = {
            headTags: scripts.map(src => ({ tagName: 'script', attributes: { defer: true, src } })),
            bodyTags: [],
          };
          for (const tap of HtmlWebpackPlugin._hooks.get(compilation)?.alterAssetTagGroups.taps ?? []) {
            groups = tap(groups);
          }
          const head = groups.headTags.map(
            tag =>
              `<${tag.tagName}${Object.entries(tag.attributes)
                .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${value}"`))
                .join('')}>${tag.innerHTML ?? ''}</${tag.tagName}>`,
          );
          compilation.emitAsset('index.html', new sources.RawSource(`<html><head>${head.join('')}</head></html>`));
        },
      );
    });
  }
}

function build(config: Configuration): Promise<Stats> {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        return reject(err);
      }
      if (!stats || stats.hasErrors()) {
        return reject(new Error(stats?.toString() ?? 'no stats'));
      }
      resolve(stats);
    });
  });
}

describe('release injection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-webpack-release-injection-'));
    fs.writeFileSync(
      path.join(tmpDir, 'entry.js'),
      'import { shared } from "./shared.js";\nconsole.log("entry", shared);\nimport(/* webpackChunkName: "route" */ "./route.js");\n',
    );
    fs.writeFileSync(path.join(tmpDir, 'shared.js'), 'export const shared = "shared";\nconsole.log(shared);\n');
    fs.writeFileSync(
      path.join(tmpDir, 'route.js'),
      'import { shared } from "./shared.js";\nconsole.log("route", shared);\n',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('injects the release only into initial chunks', { timeout: 15_000 }, async () => {
    const outDir = path.join(tmpDir, 'dist');

    await build({
      mode: 'production',
      context: tmpDir,
      entry: './entry.js',
      output: { path: outDir, filename: '[name].js', chunkFilename: '[name].js' },
      plugins: [sentryWebpackPlugin({ telemetry: false, release: { name: '1.2.3', create: false } })],
    });

    const mainChunk = fs.readFileSync(path.join(outDir, 'main.js'), 'utf8');
    const routeChunk = fs.readFileSync(path.join(outDir, 'route.js'), 'utf8');

    expect(mainChunk).toMatch(RELEASE_SNIPPET);
    expect(routeChunk).not.toMatch(RELEASE_SNIPPET);

    expect(mainChunk).toMatch(DEBUG_ID_MARKER);
    expect(routeChunk).toMatch(DEBUG_ID_MARKER);
  });

  describe("with `inject: 'html'`", () => {
    function buildApp(release: string, options: { html?: boolean; inject?: 'html' } = {}): Promise<Stats> {
      return build({
        mode: 'production',
        context: tmpDir,
        entry: './entry.js',
        output: {
          path: path.join(tmpDir, 'dist'),
          filename: '[name].[contenthash].js',
          chunkFilename: '[name].[contenthash].js',
          clean: true,
        },
        plugins: [
          ...(options.html === false ? [] : [new HtmlWebpackPlugin()]),
          sentryWebpackPlugin({ telemetry: false, release: { name: release, create: false, inject: options.inject } }),
        ],
      });
    }

    function readOutput(): { html: string; chunks: Record<string, string> } {
      const outDir = path.join(tmpDir, 'dist');
      const chunks: Record<string, string> = {};
      for (const file of fs.readdirSync(outDir).filter(file => file.endsWith('.js'))) {
        chunks[file] = fs.readFileSync(path.join(outDir, file), 'utf8');
      }
      const htmlPath = path.join(outDir, 'index.html');
      return { html: fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '', chunks };
    }

    it(
      'injects the release into the HTML head before the app scripts, and not into any chunk',
      { timeout: 15_000 },
      async () => {
        await buildApp('1.2.3', { inject: 'html' });

        const { html, chunks } = readOutput();
        const script = html.match(INLINE_SCRIPT);
        expect(script).not.toBeNull();
        expect(script?.index).toBeLessThan(html.indexOf('<script defer'));
        const context: { SENTRY_RELEASE?: unknown } = {};
        runInNewContext(script?.groups?.code ?? '', context);
        expect(context.SENTRY_RELEASE).toEqual({ id: '1.2.3' });

        expect(Object.keys(chunks)).toHaveLength(2);
        for (const chunk of Object.values(chunks)) {
          expect(chunk).not.toContain('SENTRY_RELEASE');
          expect(chunk).toMatch(DEBUG_ID_MARKER);
        }
      },
    );

    it('keeps JS file names the same when only the release changes', { timeout: 15_000 }, async () => {
      await buildApp('release-a', { inject: 'html' });
      const firstNames = Object.keys(readOutput().chunks).sort();
      await buildApp('release-b', { inject: 'html' });

      expect(Object.keys(readOutput().chunks).sort()).toEqual(firstNames);
    });

    it('changes JS file names with the release when injecting into chunks', { timeout: 15_000 }, async () => {
      await buildApp('release-a');
      const firstNames = Object.keys(readOutput().chunks).sort();
      await buildApp('release-b');

      expect(Object.keys(readOutput().chunks).sort()).not.toEqual(firstNames);
      expect(readOutput().html).not.toContain('SENTRY_RELEASE');
    });

    it(
      'warns and injects the release into the startup chunk without html-webpack-plugin',
      { timeout: 15_000 },
      async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await buildApp('1.2.3', { inject: 'html', html: false });

        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("`release.inject: 'html'` needs `html-webpack-plugin`"),
        );
        const { chunks } = readOutput();
        const mainChunk = Object.entries(chunks).find(([file]) => file.startsWith('main.'))?.[1];
        const routeChunk = Object.entries(chunks).find(([file]) => file.startsWith('route.'))?.[1];
        expect(mainChunk).toMatch(RELEASE_SNIPPET);
        expect(routeChunk).not.toMatch(RELEASE_SNIPPET);
      },
    );
  });
});
