// The following types were copied from 'svelte/compiler'-internal
// type definitions
// see: https://github.com/sveltejs/svelte/blob/master/src/compiler/preprocess/types.ts
interface Processed {
  code: string;
  map?: string | Record<string, unknown>;
  dependencies?: string[];
  toString?: () => string;
}

type MarkupPreprocessor = (options: {
  content: string;
  filename?: string;
}) => Processed | void | Promise<Processed | void>;

type Preprocessor = (options: {
  /**
   * The script/style tag content
   */
  content: string;
  attributes: Record<string, string | boolean>;
  /**
   * The whole Svelte file content
   */
  markup: string;
  filename?: string;
}) => Processed | void | Promise<Processed | void>;

export interface PreprocessorGroup {
  markup?: MarkupPreprocessor;
  style?: Preprocessor;
  script?: Preprocessor;
}

// Alternatively, we could use a direct from svelte/compiler/preprocess
// TODO: figure out what's better and roll with that
// import { PreprocessorGroup } from 'svelte/types/compiler/preprocess';

export type SpanOptions = {
  /**
   * If true, spans are be recorded between component intialization and Svellte's
   * onMount lifecycle hook
   *
   * defaults to true if component tracking is enabled
   */
  trackMount?: boolean;

  /**
   * If true, spans are recorded between each component's beforeUpdate and afterUpdate
   * lifecycle hooks
   *
   * defaults to true if component tracking is enabled
   */
  trackUpdates?: boolean;
};

/**
 * Control which components and which operations should be tracked
 * and recorded as spans
 */
export type ComponentTrackingInitOptions = {
  /**
   * Control if all your Svelte components should be tracked or only a specified list
   * of components.
   * If set to true, all components will be tracked.
   * If you only want to track a selection of components, specify the component names
   * as an array.
   *
   * defaults to: true
   */
  trackComponents: boolean | string[];
} & SpanOptions;

export type TrackingOptions = {
  componentName?: string;
} & SpanOptions;
