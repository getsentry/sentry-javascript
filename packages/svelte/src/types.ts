import type { CompileOptions } from 'svelte/compiler';

// Adds an id property to the preprocessor object we can use to check for duplication
// in the preprocessors array
export interface SentryPreprocessorGroup extends PreprocessorGroup {
  sentryId?: string;
}

/**
 * The object exported from `svelte.config.js`
 */
export type SvelteConfig = {
  [key: string]: unknown;
  preprocess?: PreprocessorGroup[] | PreprocessorGroup;
  compilerOptions?: CompileOptions;
};

/**
 * Options users can provide to `withSentryConfig` to customize what Sentry adds too the Svelte config
 */
export type SentrySvelteConfigOptions = {
  componentTracking?: ComponentTrackingInitOptions;
};

export type SpanOptions = {
  /**
   * If true, a span is recorded between a component's initialization and its
   * onMount lifecycle hook. This span tells how long it takes a component
   * to be created and inserted into the DOM.
   *
   * @default `true` if component tracking is enabled
   */
  trackInit?: boolean;

  /**
   * If true, a span is recorded between a component's beforeUpdate and afterUpdate
   * lifecycle hooks.
   *
   * Caution: Component updates can only be tracked in Svelte versions prior to version 5
   * or in Svelte 5 in legacy mode (i.e. without Runes).
   *
   * @default `false` if component tracking is enabled
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
   * Defaults to true if the preprocessor is used
   */
  trackComponents?: boolean | string[];
} & SpanOptions;

export type TrackComponentOptions = {
  /**
   * The name of the component to be used in the recorded spans.
   *
   * @default to <Svelte Component> if not specified
   */
  componentName?: string;
} & SpanOptions;

// vendor those types from svelte/types/compiler/preprocess
export interface Processed {
  code: string;
  map?: string | object;
  dependencies?: string[];
  toString?: () => string;
}
export declare type MarkupPreprocessor = (options: {
  content: string;
  filename?: string;
}) => Processed | void | Promise<Processed | void>;
export declare type Preprocessor = (options: {
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
