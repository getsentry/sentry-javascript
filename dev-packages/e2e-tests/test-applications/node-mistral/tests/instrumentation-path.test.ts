import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Guards the premise the prod run rests on. `Sentry.init` registers the runtime injection hook
// unless `enableRuntimeChannelInjection` is false, which `instrument.mjs` sets outside dev. With
// that off and no `--import` on the bundled start command, the bundler plugin is the only thing
// that can have injected these channels, so finding them in the built file is what makes a passing
// production run mean build-time instrumentation rather than a silent fallback.
test('the bundle carries build-time injected channels', () => {
  test.skip(process.env.TEST_ENV === 'development', 'the dev run is instrumented by the runtime hook');

  const bundle = readFileSync('dist/app.cjs', 'utf8');

  expect(bundle).toContain('orchestrion:@mistralai/mistralai:chat');
  expect(bundle).toContain('orchestrion:@mistralai/mistralai:chat-stream');
  expect(bundle).toContain('orchestrion:dataloader:load');
});
