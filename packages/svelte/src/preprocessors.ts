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

  return {
    // This script hook is called whenever a Svelte component's <script>
    // content is preprocessed.
    // `content` contains the script code as a string
    script: ({ content, filename }) => {
      if (!shouldInjectFunction(mergedOptions.trackComponents, filename)) {
        return { code: content };
      }

      const { trackMount, trackUpdates } = mergedOptions;
      const trackComponentOptions: TrackComponentOptions = {
        trackMount,
        trackUpdates,
        componentName: getBaseName(filename || ''),
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
  filename: string | undefined,
): boolean {
  if (!trackComponents || !filename) {
    return false;
  }
  if (Array.isArray(trackComponents)) {
    // TODO: this probably needs to be a little more robust
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
