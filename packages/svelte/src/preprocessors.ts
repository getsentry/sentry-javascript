import MagicString from 'magic-string';

import { ComponentTrackingInitOptions, PreprocessorGroup, TrackComponentOptions } from './types';

export const defaultComponentTrackingOptions: Required<ComponentTrackingInitOptions> = {
  trackComponents: true,
  trackMount: true,
  trackUpdates: true,
};

/**
 * Svelte Preprocessor to inject Sentry performance monitoring related code
 * into Svelte components.
 */
export function componentTrackingPreprocessor(options?: ComponentTrackingInitOptions): PreprocessorGroup {
  const mergedOptions = { ...defaultComponentTrackingOptions, ...options };

  const visitedFiles = new Set<string>();

  return {
    // This script hook is called whenever a Svelte component's <script>
    // content is preprocessed.
    // `content` contains the script code as a string
    script: ({ content, filename, attributes }) => {
      // TODO: Not sure when a filename could be undefined. Using this 'unknown' fallback for the time being
      const finalFilename = filename || 'unknown';

      if (!shouldInjectFunction(mergedOptions.trackComponents, finalFilename, attributes, visitedFiles)) {
        return { code: content };
      }

      const { trackMount, trackUpdates } = mergedOptions;
      const trackComponentOptions: TrackComponentOptions = {
        trackMount,
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
  const componentName = segments[segments.length - 1].replace('.svelte', '');
  return componentName;
}
