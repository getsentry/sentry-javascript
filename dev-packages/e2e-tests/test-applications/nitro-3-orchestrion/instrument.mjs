import { tracingChannel } from 'node:diagnostics_channel';
import { rmSync, writeFileSync } from 'node:fs';
import { isMainThread } from 'node:worker_threads';
import { nitroChannels } from '@sentry/server-utils/orchestrion/config';
import { MAIN_THREAD_RECORDS_FILE } from './main-thread-records.mjs';

const records = (globalThis.__channelRecords = []);
const mainThreadRecords = [];

if (isMainThread) {
  rmSync(MAIN_THREAD_RECORDS_FILE, { force: true });
}

// Only what the tests assert on: the full payloads hold requests, apps and dev servers.
function describe(channel, event, ctx) {
  const [arg0, arg1, , arg3] = ctx.arguments ?? [];
  switch (channel) {
    case nitroChannels.NITRO_USE_NITRO_APP:
      return event === 'end' ? { resultKeys: Object.keys(ctx.result ?? {}).sort() } : {};
    case nitroChannels.NITRO_RUN_TASK:
      return { name: arg0, error: ctx.error?.message };
    case nitroChannels.H3_PREPARE_RESPONSE:
      return {
        path: arg1?.url?.pathname,
        matchedRoute: arg1?.context?.matchedRoute?.route,
        error: arg0 instanceof Error ? arg0.message : undefined,
        nested: arg3,
      };
    case nitroChannels.H3_CORE_HANDLER:
      return { path: arg0?.url?.pathname };
    case nitroChannels.H3_CALL_LAYER:
      return { path: arg1?.url?.pathname };
    case nitroChannels.NITRO_DEV_APP:
      return { hasFetch: typeof ctx.self?.fetch === 'function' };
  }
}

for (const channel of Object.values(nitroChannels)) {
  const record = event => ctx => {
    const entry = { channel, event, ...describe(channel, event, ctx) };
    if (channel === nitroChannels.NITRO_DEV_APP) {
      mainThreadRecords.push(entry);
      writeFileSync(MAIN_THREAD_RECORDS_FILE, JSON.stringify(mainThreadRecords));
    } else {
      records.push(entry);
    }
  };

  tracingChannel(channel).subscribe({
    start: record('start'),
    end: record('end'),
    asyncStart: record('asyncStart'),
    asyncEnd: record('asyncEnd'),
    error: record('error'),
  });
}
