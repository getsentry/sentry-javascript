import MagicString from 'magic-string';
import type { PreprocessorGroup } from 'svelte/types/compiler/preprocess';

import type { ComponentTrackingInitOptions, SentryPreprocessorGroup, TrackComponentOptions } from './types';

export const defaultComponentTrackingOptions: Required<ComponentTrackingInitOptions> = {
  trackComponents: true,
  trackInit: true,
  trackUpdates: true,
};

export const FIRST_PASS_COMPONENT_TRACKING_PREPROC_ID = 'FIRST_PASS_COMPONENT_TRACKING_PREPROCESSOR';

/**
 * Svelte Preprocessor to inject Sentry performance monitoring related code
 * into Svelte components.
 *
 * @deprecated Use `withSentryConfig` which is the new way of making compile-time modifications
 *             to Svelte apps going forward.
 */
export function componentTrackingPreprocessor(options?: ComponentTrackingInitOptions): PreprocessorGroup {
  const mergedOptions = { ...defaultComponentTrackingOptions, ...options };

  const visitedFiles = new Set<string>();
  const visitedFilesMarkup = new Set<string>();

  const preprocessor: PreprocessorGroup = {
    // This markup hook is called once per .svelte component file, before the `script` hook is called
    // We use it to check if the passed component has a <script> tag. If it doesn't, we add one to inject our
    // code later on, when the `script` hook is executed.
    markup: ({ content, filename }) => {
      const finalFilename = filename || 'unknown';
      const shouldInject = shouldInjectFunction(mergedOptions.trackComponents, finalFilename, {}, visitedFilesMarkup);

      if (shouldInject && !hasScriptTag(content)) {
        // Insert a <script> tag into the component file where we can later on inject our code.
        // We have to add a placeholder to the script tag because for empty script tags,
        // the `script` preprocessor hook won't be called
        // Note: The space between <script> and </script> is important! Without any content,
        // the `script` hook wouldn't  be executed for the added script tag.
        const s = new MagicString(content);
        s.prepend('<script>\n</script>\n');
        return { code: s.toString(), map: s.generateMap().toString() };
      }

      return { code: content };
    },

    // This script hook is called whenever a Svelte component's <script> content is preprocessed.
    // `content` contains the script code as a string
    script: ({ content, filename, attributes }) => {
      // TODO: Not sure when a filename could be undefined. Using this 'unknown' fallback for the time being
      const finalFilename = filename || 'unknown';

      if (!shouldInjectFunction(mergedOptions.trackComponents, finalFilename, attributes, visitedFiles)) {
        return { code: content };
      }

      const { trackInit, trackUpdates } = mergedOptions;
      const trackComponentOptions: TrackComponentOptions = {
        trackInit,
        trackUpdates,
        componentName: getBaseName(finalFilename),
      };

      const importStmt = 'import { trackComponent } from "@sentry/svelte";\n';
      const functionCall = `trackComponent(${JSON.stringify(trackComponentOptions)});\n`;

      const s = new MagicString(content);
      s.prepend(functionCall).prepend(importStmt);

      const updatedCode = s.toString();
      const updatedSourceMap = s.generateMap().toString();

      return { code: updatedCode, map: updatedSourceMap };
    },
  };

  const sentryPreprocessor: SentryPreprocessorGroup = {
    ...preprocessor,
    sentryId: FIRST_PASS_COMPONENT_TRACKING_PREPROC_ID,
  };

  return sentryPreprocessor;
}

function shouldInjectFunction(
  trackComponents: Required<ComponentTrackingInitOptions['trackComponents']>,
  filename: string,
  attributes: Record<string, string | boolean>,
  visitedFiles: Set<string>,
): boolean {
  // We do cannot inject our function multiple times into the same component
  // This can happen when a component has multiple <script> blocks
  if (visitedFiles.has(filename)) {
    return false;
  }
  visitedFiles.add(filename);

  // We can't inject our function call into <script context="module"> blocks
  // because the code inside is not executed when the component is instantiated but
  // when the module is first imported.
  // see: https://svelte.dev/docs#component-format-script-context-module
  if (attributes.context === 'module') {
    return false;
  }

  if (!trackComponents) {
    return false;
  }

  if (Array.isArray(trackComponents)) {
    const componentName = getBaseName(filename);
    return trackComponents.some(allowed => allowed === componentName);
  }

  return true;
}

function getBaseName(filename: string): string {
  const segments = filename.split('/');
  return segments[segments.length - 1].replace('.svelte', '');
}

function hasScriptTag(content: string): boolean {
  // This regex is taken from the Svelte compiler code.
  // They use this regex to find matching script tags that are passed to the `script` preprocessor hook:
  // https://github.com/sveltejs/svelte/blob/bb83eddfc623437528f24e9fe210885b446e72fa/src/compiler/preprocess/index.ts#L144
  // However, we remove the first part of the regex to not match HTML comments
  const scriptTagRegex = /<script(\s[^]*?)?(?:>([^]*?)<\/script\s*>|\/>)/gi;

  // Regex testing is not a super safe way of checking for the presence of a <script> tag in the Svelte
  // component file but I think we can use it as a start.
  // A case that is not covered by regex-testing HTML is e.g. nested <script> tags but I cannot
  // think of why one would do this in Svelte components. For instance, the Svelte compiler errors
  // when there's more than one top-level script tag.
  return scriptTagRegex.test(content);
}
