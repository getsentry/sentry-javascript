import { spawnSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { supports } from '../../../node-integration-tests/utils';

function runScenario(file: string): string {
  const res = spawnSync('bun', ['run', join(__dirname, file)], { cwd: __dirname, encoding: 'utf8' });
  expect(res.status, `run failed:\nstderr:\n${res.stderr}\nstdout:\n${res.stdout}`).toBe(0);
  return `${res.stdout}${res.stderr}`;
}

describe('no channel injection (Bun)', () => {
  it('warns without `debug` when the app runs unbuilt with `bun run` and no channels are injected', () => {
    const output = runScenario('scenario.ts');

    expect(output).toContain('No diagnostics-channel injection detected');
    expect(output).toContain('@sentry/bun/plugin');
  });

  it.runIf(supports({ bunMin: '1.4.6' }))('does not warn when `init()` injects the channels in `bun run`', () => {
    expect(runScenario('scenario-runtime-injection.ts')).not.toContain('No diagnostics-channel injection detected');
  });

  it('does not warn when no channel integration is installed', () => {
    expect(runScenario('scenario-no-integrations.ts')).not.toContain('No diagnostics-channel injection detected');
  });
});
