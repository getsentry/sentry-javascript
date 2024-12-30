import * as fs from 'fs';
import * as path from 'path';
import { consoleSandbox } from '@sentry/core';
import type { Nitro } from 'nitropack';

// Nitro presets for hosts that only host static files
export const staticHostPresets = ['github_pages'];
// Nitro presets for hosts that use `server.mjs` as opposed to `index.mjs`
export const serverFilePresets = ['netlify'];

/**
 * Adds the built `instrument.server.js` file to the output directory.
 *
 * As Sentry also imports the release injection file, this needs to be copied over manually as well.
 * TODO: The mechanism of manually copying those files could maybe be improved
 *
 * This will no-op if no `instrument.server.js` file was found in the
 * build directory. Make sure the `sentrySolidStartVite` plugin was
 * added to `app.config.ts` to enable building the instrumentation file.
 */
export async function addInstrumentationFileToBuild(nitro: Nitro): Promise<void> {
  nitro.hooks.hook('close', async () => {
    // Static file hosts have no server component so there's nothing to do
    if (staticHostPresets.includes(nitro.options.preset)) {
      return;
    }

    const buildDir = nitro.options.buildDir;
    const serverDir = nitro.options.output.serverDir;

    try {
      // 1. Create assets directory first (for release-injection-file)
      const assetsServerDir = path.join(serverDir, 'assets');
      if (!fs.existsSync(assetsServerDir)) {
        await fs.promises.mkdir(assetsServerDir, { recursive: true });
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.log(`[Sentry SolidStart withSentry] Successfully created directory ${assetsServerDir}.`);
        });
      }

      // 2. Copy release injection file if available
      try {
        const ssrAssetsPath = path.resolve(buildDir, 'build', 'ssr', 'assets');
        const assetsBuildDir = await fs.promises.readdir(ssrAssetsPath);
        const releaseInjectionFile = assetsBuildDir.find(file => file.startsWith('_sentry-release-injection-file-'));

        if (releaseInjectionFile) {
          const releaseSource = path.resolve(ssrAssetsPath, releaseInjectionFile);
          const releaseDestination = path.resolve(assetsServerDir, releaseInjectionFile);

          await fs.promises.copyFile(releaseSource, releaseDestination);
          consoleSandbox(() => {
            // eslint-disable-next-line no-console
            console.log(`[Sentry SolidStart withSentry] Successfully created ${releaseDestination}.`);
          });
        }
      } catch (err) {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn('[Sentry SolidStart withSentry] Failed to copy release injection file.', err);
        });
      }

      // 3. Copy Sentry server instrumentation file
      const instrumentSource = path.resolve(buildDir, 'build', 'ssr', 'instrument.server.js');
      const instrumentDestination = path.resolve(serverDir, 'instrument.server.mjs');

      await fs.promises.copyFile(instrumentSource, instrumentDestination);
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.log(`[Sentry SolidStart withSentry] Successfully created ${instrumentDestination}.`);
      });
    } catch (error) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn('[Sentry SolidStart withSentry] Build process failed.', error);
      });
    }
  });
}

/**
 * Adds an `instrument.server.mjs` import to the top of the server entry file.
 *
 * This is meant as an escape hatch and should only be used in environments where
 * it's not possible to `--import` the file instead as it comes with a limited
 * tracing experience, only collecting http traces.
 */
export async function addSentryTopImport(nitro: Nitro): Promise<void> {
  nitro.hooks.hook('close', async () => {
    const buildPreset = nitro.options.preset;
    const serverDir = nitro.options.output.serverDir;

    // Static file hosts have no server component so there's nothing to do
    if (staticHostPresets.includes(buildPreset)) {
      return;
    }

    const instrumentationFile = path.resolve(serverDir, 'instrument.server.mjs');
    const serverEntryFileName = serverFilePresets.includes(buildPreset) ? 'server.mjs' : 'index.mjs';
    const serverEntryFile = path.resolve(serverDir, serverEntryFileName);

    try {
      await fs.promises.access(instrumentationFile, fs.constants.F_OK);
    } catch (error) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          `[Sentry SolidStart withSentry] Failed to add \`${instrumentationFile}\` as top level import to \`${serverEntryFile}\`.`,
          error,
        );
      });
      return;
    }

    try {
      const content = await fs.promises.readFile(serverEntryFile, 'utf-8');
      const updatedContent = `import './instrument.server.mjs';\n${content}`;
      await fs.promises.writeFile(serverEntryFile, updatedContent);

      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.log(
          `[Sentry SolidStart withSentry] Added \`${instrumentationFile}\` as top level import to \`${serverEntryFile}\`.`,
        );
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry SolidStart withSentry] An error occurred when trying to add \`${instrumentationFile}\` as top level import to \`${serverEntryFile}\`.`,
        error,
      );
    }
  });
}
