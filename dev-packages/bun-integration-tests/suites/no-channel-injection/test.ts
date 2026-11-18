import { spawnSync } from 'child_process';
import { rmSync } from 'fs';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';

function runBun(...args: string[]): string {
  const res = spawnSync('bun', args, { cwd: __dirname, encoding: 'utf8' });
  expect(res.status, `run failed:\nstderr:\n${res.stderr}\nstdout:\n${res.stdout}`).toBe(0);
  return `${res.stdout}${res.stderr}`;
}

describe('no channel injection (Bun)', () => {
  it('warns without `debug` when the app runs unbuilt', () => {
    const output = runBun('--preload', join(__dirname, 'instrument.ts'), join(__dirname, 'app.ts'));

    expect(output).toContain('No diagnostics-channel injection detected');
    expect(output).toContain('@sentry/bun/plugin');
  });

  it('does not warn when `bun --preload` starts the SDK before an app built with `@sentry/bun/plugin`', () => {
    const outfile = runBun('run', join(__dirname, 'build.ts'))
      .match(/BUILD_OK (.+)/)?.[1]
      ?.trim();
    expect(outfile).toBeTruthy();

    try {
      const output = runBun('--preload', join(__dirname, 'instrument.ts'), outfile as string);

      expect(output).not.toContain('No diagnostics-channel injection detected');
    } finally {
      rmSync(dirname(outfile as string), { recursive: true, force: true });
    }
  });

  it('does not warn when no channel integration is installed', () => {
    expect(runBun('run', join(__dirname, 'scenario-no-integrations.ts'))).not.toContain(
      'No diagnostics-channel injection detected',
    );
  });
});
