import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BUILT_MODULE = resolve(__dirname, '../../build/esm/nitro/module.js');

// The module resolves the runtime plugin relative to its own file, so only the build output shows that the path is right.
describe('built Nitro module', () => {
  it('imports the runtime plugin from a file in build/esm', async () => {
    const { createSentryNitroModule } = await import(BUILT_MODULE);
    const virtual: Record<string, () => string> = {};
    const nitro = {
      options: { rootDir: __dirname, modules: [], plugins: [], scanDirs: [], virtual },
      logger: { warn: () => undefined },
      hooks: { hook: () => undefined },
    };

    createSentryNitroModule({ serverConfigFile: false }).setup(nitro);

    const runtimePluginFile = JSON.parse(
      /import \{ setupSentryNitroApp \} from (".*");/.exec(virtual['#sentry/nitro-plugin']!())![1]!,
    );
    expect(runtimePluginFile).toBe(resolve(__dirname, '../../build/esm/integrations/nitro/runtimePlugin.js'));
    expect(existsSync(runtimePluginFile)).toBe(true);
    expect(typeof (await import(runtimePluginFile)).setupSentryNitroApp).toBe('function');
  });
});
