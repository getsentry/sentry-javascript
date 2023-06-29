// Types for compiled templates
declare module '@sentry/ember/templates/*' {
  import { TemplateFactory } from 'ember-cli-htmlbars';

  const tmpl: TemplateFactory;
  export default tmpl;
}

/**
 * This is private as of now.
 * See https://github.com/emberjs/ember.js/blob/master/packages/@ember/instrumentation/index.ts
 */
declare module '@ember/instrumentation' {
  export function subscribe(pattern: string, object: {}): any;
}
