import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: `pnpm preview`,
});

// Real bfcache only restores under the full Chrome-for-Testing binary (`channel: 'chromium'`) with
// Playwright's default `--disable-back-forward-cache` flag stripped and the feature enabled. The
// default headless binary (`chromium_headless_shell`) has no bfcache, so without this the restore
// never happens and the test would be meaningless.
for (const project of config.projects ?? []) {
  project.use = {
    ...project.use,
    channel: 'chromium',
    launchOptions: {
      ignoreDefaultArgs: ['--disable-back-forward-cache'],
      args: ['--enable-features=BackForwardCache'],
    },
  };
}

// Extra server that holds a WebSocket open, used by the `?botch=websocket` blocker case.
config.webServer.push({
  command: 'node start-ws-server.mjs',
  port: 3034,
  stdout: 'pipe',
  stderr: 'pipe',
});

export default config;
