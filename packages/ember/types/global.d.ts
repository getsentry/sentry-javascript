// Types for compiled templates
declare module '@sentry/ember/templates/*' {
  import type { TemplateFactory } from 'htmlbars-inline-precompile';
  const tmpl: TemplateFactory;
  export default tmpl;
}

/**
 * This is private as of now.
 * See https://github.com/emberjs/ember.js/blob/master/packages/@ember/instrumentation/index.ts
 */
declare module '@ember/instrumentation' {
  // oxlint-disable-next-line typescript/no-explicit-any
  export function subscribe(pattern: string, object: {}): any;
}
