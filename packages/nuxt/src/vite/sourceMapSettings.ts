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
