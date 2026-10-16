import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureTunnelRouteFile } from '../../../src/config/withSentryConfig/tunnel';

describe('ensureTunnelRouteFile', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nextjs-tunnel-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function mkdirs(...dirs: string[]): void {
    dirs.forEach(dir => fs.mkdirSync(path.join(projectDir, dir), { recursive: true }));
  }

  it.each([
    ['a root app dir', ['app', 'src/app'], 'app/sentry-tunnel/route.js'],
    ['a root pages dir next to an unrelated src dir', ['pages', 'src/utils'], 'app/sentry-tunnel/route.js'],
    ['a src app dir', ['src/app'], 'src/app/sentry-tunnel/route.js'],
    ['a src pages dir', ['src/pages'], 'src/app/sentry-tunnel/route.js'],
    ['no app or pages dir', [], 'app/sentry-tunnel/route.js'],
  ])('writes the route into the app dir Next.js reads, given %s', (_, dirs, expected) => {
    mkdirs(...dirs);

    expect(ensureTunnelRouteFile(projectDir)).toBe(path.join(projectDir, expected));
  });

  it('writes a TypeScript route when the project has a tsconfig', () => {
    fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), '{}');

    expect(ensureTunnelRouteFile(projectDir)).toBe(path.join(projectDir, 'app/sentry-tunnel/route.ts'));
  });

  it('keeps an existing route', () => {
    mkdirs('app/sentry-tunnel');
    fs.writeFileSync(path.join(projectDir, 'app/sentry-tunnel/route.ts'), '');

    expect(ensureTunnelRouteFile(projectDir)).toBeUndefined();
  });
});
