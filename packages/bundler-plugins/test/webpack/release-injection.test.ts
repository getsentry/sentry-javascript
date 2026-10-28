import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { webpack } from 'webpack';
import type { Configuration, Stats } from 'webpack';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sentryWebpackPlugin } from '../../src/webpack/index';

const RELEASE_SNIPPET = /SENTRY_RELEASE\s*=\s*\{\s*id:\s*"1\.2\.3"\s*\}/;
const DEBUG_ID_MARKER = /sentry-dbid-[0-9a-f-]{36}/;

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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('injects the release only into initial chunks', async () => {
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
});
