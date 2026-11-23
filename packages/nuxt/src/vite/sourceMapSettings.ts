import { resolveSourceMapsFeatures } from '@sentry/core';
import type { SentryNuxtModuleOptions } from '../common/types';

/** A valid source map setting */
export type SourceMapSetting = boolean | 'hidden' | 'inline';

/** Returns the Nuxt source map setting that applies to the given runtime. */
export function extractNuxtSourceMapSetting(
  nuxt: { options: { sourcemap?: SourceMapSetting | { server?: SourceMapSetting; client?: SourceMapSetting } } },
  runtime: 'client' | 'server' | undefined,
): SourceMapSetting | undefined {
  if (!runtime) {
    return undefined;
  } else {
    return typeof nuxt.options?.sourcemap === 'boolean' || typeof nuxt.options?.sourcemap === 'string'
      ? nuxt.options.sourcemap
      : nuxt.options?.sourcemap?.[runtime];
  }
}

/**
 * Validates that source map settings are consistent between Nuxt and Vite/Nitro configurations.
 * Logs a warning if conflicting settings are detected.
 */
export function validateDifferentSourceMapSettings({
  nuxtSettingKey,
  nuxtSettingValue,
  otherSettingKey,
  otherSettingValue,
}: {
  nuxtSettingKey: string;
  nuxtSettingValue?: SourceMapSetting;
  otherSettingKey: string;
  otherSettingValue?: SourceMapSetting;
}): void {
  if (nuxtSettingValue !== otherSettingValue) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] Source map generation settings are conflicting. Sentry uses \`${nuxtSettingKey}: ${nuxtSettingValue}\`. However, a conflicting setting was discovered (\`${otherSettingKey}: ${otherSettingValue}\`). This setting was probably explicitly set in your configuration. Sentry won't override this setting but it may affect source maps generation and upload. Without source maps, code snippets on the Sentry Issues page will remain minified.`,
    );
  }
}

/**
 * Whether Sentry turns source maps on that the user did not set: when it uploads them, or when
 * `sourcemaps.delete: false` keeps them for a manual upload.
 */
export function sentryEnablesSourceMaps(moduleOptions: SentryNuxtModuleOptions): boolean {
  const { sourcemaps } = moduleOptions;
  const { injectDebugIds, upload, legacyDisable } = resolveSourceMapsFeatures(sourcemaps);
  // TODO(v12): Remove the `disable-upload` case along with `sourcemaps.disable`.
  return (
    legacyDisable === 'disable-upload' ||
    (upload && hasUploadCredentials(moduleOptions)) ||
    (sourcemaps?.delete === false && injectDebugIds)
  );
}

/**
 * The credentials checks of the Sentry plugin, which uploads nothing without them. The plugins are created
 * before this runs, so `process.env` also holds the values of `.env.sentry-build-plugin`.
 */
function hasUploadCredentials(moduleOptions: SentryNuxtModuleOptions): boolean {
  const authToken = moduleOptions.authToken ?? process.env.SENTRY_AUTH_TOKEN;
  const org = moduleOptions.org ?? process.env.SENTRY_ORG;
  const project = moduleOptions.project ?? process.env.SENTRY_PROJECT;
  return (
    !!authToken && (!!org || authToken.startsWith('sntrys_')) && (Array.isArray(project) ? !!project[0] : !!project)
  );
}

/** Logs that the user's source map setting is kept. */
export function logKeepEnabledSourceMapSetting(
  sentryNuxtModuleOptions: SentryNuxtModuleOptions,
  settingKey: string,
  settingValue: string,
): void {
  if (sentryNuxtModuleOptions.debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[Sentry] \`${settingKey}\` is enabled with \`${settingValue}\`. This will correctly un-minify the code snippet on the Sentry Issue Details page.`,
    );
  }
}

/** Warns that the user turned source maps off. */
export function warnExplicitlyDisabledSourceMap(settingKey: string, isDebug: boolean | undefined): void {
  if (isDebug) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] Source map generation is currently disabled in your Vite configuration (\`${settingKey}: false \`). This setting is either a default setting or was explicitly set in your configuration. Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified. To show unminified code, enable source maps in \`${settingKey}\` (e.g. by setting them to \`hidden\`).`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[Sentry] Source map generation (\`${settingKey}\`) is disabled in your Vite configuration.`);
  }
}

/** Logs that Sentry turned source maps on. */
export function logSentryEnablesSourceMap(settingKey: string, settingValue: string): void {
  // eslint-disable-next-line no-console
  console.log(`[Sentry] Enabled source map generation in the build options with \`${settingKey}: ${settingValue}\`.`);
}
