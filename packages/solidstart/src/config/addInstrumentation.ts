import * as fs from 'fs';
import * as path from 'path';
import { consoleSandbox } from '@sentry/utils';
import type { Nitro } from './types';

// Nitro presets for hosts that only host static files
export const staticHostPresets = ['github_pages'];
// Nitro presets for hosts that use `server.mjs` as opposed to `index.mjs`
export const serverFilePresets = ['netlify'];

/**
 * Adds the built `instrument.server.js` file to the output directory.
 *
 * This will no-op if no `instrument.server.js` file was found in the
 * build directory. Make sure the `sentrySolidStartVite` plugin was
 * added to `app.config.ts` to enable building the instrumentation file.
 */
export async function addInstrumentationFileToBuild(nitro: Nitro): Promise<void> {
  // Static file hosts have no server component so there's nothing to do
  if (staticHostPresets.includes(nitro.options.preset)) {
    return;
  }

  const buildDir = nitro.options.buildDir;
  const serverDir = nitro.options.output.serverDir;
  const source = path.resolve(buildDir, 'build', 'ssr', 'instrument.server.js');
  const destination = path.resolve(serverDir, 'instrument.server.mjs');

  try {
    await fs.promises.copyFile(source, destination);

    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log(`[Sentry SolidStart withSentry] Successfully created ${destination}.`);
    });
  } catch (error) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(`[Sentry SolidStart withSentry] Failed to create ${destination}.`, error);
    });
  }
}

/**
 * Adds an `instrument.server.mjs` import to the top of the server entry file.
 *
 * This is meant as an escape hatch and should only be used in environments where
 * it's not possible to `--import` the file instead as it comes with a limited
 * tracing experience, only collecting http traces.
 */
export async function experimental_addInstrumentationFileTopLevelImportToServerEntry(
  serverDir: string,
  preset: string,
): Promise<void> {
  // Static file hosts have no server component so there's nothing to do
  if (staticHostPresets.includes(preset)) {
    return;
  }

  const instrumentationFile = path.resolve(serverDir, 'instrument.server.mjs');
  const serverEntryFileName = serverFilePresets.includes(preset) ? 'server.mjs' : 'index.mjs';
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
}
