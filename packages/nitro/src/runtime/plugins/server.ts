import { setTunnelDefaults } from '@sentry/core/server';
import { instrumentNitroTasks } from '@sentry/server-utils';
import { definePlugin } from 'nitro';
import { useRuntimeConfig } from 'nitro/runtime-config';
// @ts-expect-error - This is a virtual module
import { tasks } from '#nitro/virtual/tasks';
import { captureErrorHook } from '../hooks/captureErrorHook';

export default definePlugin(nitroApp => {
  nitroApp.hooks.hook('error', captureErrorHook);
  instrumentNitroTasks(tasks);

  // The runtime answers managed tunnel requests, under Nitro's `baseURL` unless a framework serves the app under
  // another prefix: `@sentry/solidstart` sets `sentryTunnelBasePath` to Vite's `base`.
  const runtimeConfig = useRuntimeConfig() as { app?: { baseURL?: string }; sentryTunnelBasePath?: string };
  setTunnelDefaults({ basePath: runtimeConfig.sentryTunnelBasePath || runtimeConfig.app?.baseURL });
});
