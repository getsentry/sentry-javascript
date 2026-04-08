import type { createSentryBuildPluginManager as createSentryBuildPluginManagerType } from '@sentry/bundler-plugin-core';
import { loadModule } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';
import { getBuildPluginOptions } from './getBuildPluginOptions';
import type { SentryBuildOptions } from './types';

/**
 * This function is called by Next.js after the production build is complete.
 * It is used to upload sourcemaps to Sentry.
 */
export async function handleRunAfterProductionCompile(
  {
    releaseName,
    distDir,
    buildTool,
    usesNativeDebugIds,
  }: { releaseName?: string; distDir: string; buildTool: 'webpack' | 'turbopack'; usesNativeDebugIds?: boolean },
  sentryBuildOptions: SentryBuildOptions,
): Promise<void> {
  if (sentryBuildOptions.debug) {
    // eslint-disable-next-line no-console
    console.debug('[@sentry/nextjs] Running runAfterProductionCompile logic.');
  }

  const { createSentryBuildPluginManager } =
    loadModule<{ createSentryBuildPluginManager: typeof createSentryBuildPluginManagerType }>(
      '@sentry/bundler-plugin-core',
      module,
    ) ?? {};

  if (!createSentryBuildPluginManager) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] Could not load build manager package. Will not run runAfterProductionCompile logic.',
    );
    return;
  }

  const options = getBuildPluginOptions({
    sentryBuildOptions,
    releaseName,
    distDirAbsPath: distDir,
    buildTool: `after-production-compile-${buildTool}`,
  });

  const sentryBuildPluginManager = createSentryBuildPluginManager(options, {
    buildTool,
    loggerPrefix: '[@sentry/nextjs - After Production Compile]',
  });

  await sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal();
  await sentryBuildPluginManager.createRelease();

  // Skip debug ID injection if sourcemaps are disabled which are only relevant for sourcemap correlation
  if (!usesNativeDebugIds && sentryBuildOptions.sourcemaps?.disable !== true) {
    await sentryBuildPluginManager.injectDebugIds([distDir]);
  }

  await sentryBuildPluginManager.uploadSourcemaps([distDir], {
    // We don't want to prepare the artifacts because we injected debug ids manually before
    prepareArtifacts: false,
  });
  await sentryBuildPluginManager.deleteArtifacts();

  // After deleting source map files in turbopack builds, strip any remaining
  // sourceMappingURL comments from client JS files. Without this, browsers request
  // the deleted .map files, and in Next.js 16 (turbopack) those requests fall through
  // to the app router instead of returning 404, which can break middleware-dependent
  // features like Clerk auth.
  const deleteSourcemapsAfterUpload = sentryBuildOptions.sourcemaps?.deleteSourcemapsAfterUpload ?? false;
  if (deleteSourcemapsAfterUpload && buildTool === 'turbopack') {
    await stripSourceMappingURLComments(path.join(distDir, 'static'), sentryBuildOptions.debug);
  }
}

const SOURCEMAPPING_URL_COMMENT_REGEX = /\n?\/\/[#@] sourceMappingURL=[^\n]+$/;
const CSS_SOURCEMAPPING_URL_COMMENT_REGEX = /\n?\/\*[#@] sourceMappingURL=[^\n]+\*\/$/;

/**
 * Strips sourceMappingURL comments from all JS/MJS/CJS/CSS files in the given directory.
 * This prevents browsers from requesting deleted .map files.
 */
export async function stripSourceMappingURLComments(staticDir: string, debug?: boolean): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(staticDir, { recursive: true }).then(e => e.map(f => String(f)));
  } catch {
    // Directory may not exist (e.g., no static output)
    return;
  }

  const filesToProcess = entries.filter(
    f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs') || f.endsWith('.css'),
  );

  const results = await Promise.all(
    filesToProcess.map(async file => {
      const filePath = path.join(staticDir, file);
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');

        const isCSS = file.endsWith('.css');
        const regex = isCSS ? CSS_SOURCEMAPPING_URL_COMMENT_REGEX : SOURCEMAPPING_URL_COMMENT_REGEX;

        const strippedContent = content.replace(regex, '');
        if (strippedContent !== content) {
          await fs.promises.writeFile(filePath, strippedContent, 'utf-8');
          return file;
        }
      } catch {
        // Skip files that can't be read/written
      }
      return undefined;
    }),
  );

  const strippedCount = results.filter(Boolean).length;

  if (debug && strippedCount > 0) {
    // eslint-disable-next-line no-console
    console.debug(
      `[@sentry/nextjs] Stripped sourceMappingURL comments from ${String(strippedCount)} file(s) to prevent requests for deleted source maps.`,
    );
  }
}
