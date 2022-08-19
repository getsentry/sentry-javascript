import { ComponentTrackingInitOptions, PreprocessorGroup, TrackingOptions } from './types';

const defaultComponentTrackingOptions: ComponentTrackingInitOptions = {
  trackComponents: true,
  trackMount: true,
  trackUpdates: true,
};

/**
 * Svelte Preprocessor to inject performance monitoring related code
 * into Svelte components.
 */
export function componentTrackingPreprocessor(
  options: ComponentTrackingInitOptions = defaultComponentTrackingOptions,
): PreprocessorGroup {
  return {
    // This script hook is called whenever a Svelte component's <script>
    // content is preprocessed.
    // `content` contains the script code as a string
    script: ({ content, filename }) => {
      if (!shouldInjectFunction(options.trackComponents, filename)) {
        return { code: content };
      }

      const { trackMount, trackUpdates } = options;
      const trackOptions: TrackingOptions = {
        trackMount: trackMount === undefined ? true : trackMount,
        trackUpdates: trackUpdates === undefined ? true : trackUpdates,
        componentName: getComponentName(filename || ''),
      };

      const importStmt = 'import { trackComponent } from "@sentry/svelte"\n';
      const functionCall = `trackComponent(${JSON.stringify(trackOptions)});\n`;
      console.log(functionCall);

      const updatedCode = `${importStmt}${functionCall}${content}`;
      return { code: updatedCode };
    },
  };
}

function shouldInjectFunction(
  trackComponents: ComponentTrackingInitOptions['trackComponents'],
  filename: string | undefined,
): boolean {
  if (!trackComponents || !filename) {
    return false;
  }
  if (Array.isArray(trackComponents)) {
    // TODO: this probably needs to be a little more robust
    const componentName = getComponentName(filename);
    return trackComponents.some(allowed => allowed === componentName);
  }
  return true;
}
function getComponentName(filename: string): string {
  const segments = filename.split('/');
  const componentName = segments[segments.length - 1].replace('.svelte', '');
  return componentName;
}
