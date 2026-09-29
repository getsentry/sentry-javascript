import { run } from 'remix/ui';

// No Sentry here yet: `@sentry/remix/v3/client` does not export `init` until the browser SDK lands.
export const app = run({
  async loadModule(moduleUrl, exportName) {
    let mod = await import(moduleUrl);
    return mod[exportName];
  },
});
