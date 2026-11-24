import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { nitroRuntimeConfig } from '@sentry/server-utils/orchestrion/config';
import { createLoadHookTransform } from '@sentry/server-utils/orchestrion/load-hook';

// Stands in for `@sentry/node/import`, which only applies the built-in configs. The dev servers load
// Nitro from `node_modules` without bundling it, so only a runtime hook reaches the `NitroDevApp`
// constructor, and `nitro dev` also keeps h3 external.
const transform = createLoadHookTransform({
  dcModule: 'node:diagnostics_channel',
  instrumentations: nitroRuntimeConfig,
});

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.startsWith('file:') || result.source == null) {
      return result;
    }
    const code = transform(fileURLToPath(url), String(result.source));
    return code ? { ...result, source: code } : result;
  },
});
