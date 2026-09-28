import { getCodeInjectionPosition } from '@sentry/bundler-plugins/loader-utils';
import type { LoaderThis } from './types';

export type ValueInjectionLoaderOptions = {
  values: Record<string, unknown>;
};

/**
 * Set values on the global/window object at the start of a module.
 *
 * Options:
 *   - `values`: An object where the keys correspond to the keys of the global values to set and the values
 *        correspond to the values of the values on the global object. Values must be JSON serializable.
 */
export default function valueInjectionLoader(this: LoaderThis<ValueInjectionLoaderOptions>, userCode: string): string {
  // We know one or the other will be defined, depending on the version of webpack being used
  const { values } = 'getOptions' in this ? this.getOptions() : this.query;

  // We do not want to cache injected values across builds
  this.cacheable(false);

  // Not putting any newlines in the generated code will decrease the likelihood of sourcemaps breaking
  const injectedCode =
    // eslint-disable-next-line prefer-template
    ';' +
    Object.entries(values)
      .map(([key, value]) => `globalThis["${key}"] = ${JSON.stringify(value)};`)
      .join('');

  const injectionIndex = getCodeInjectionPosition(userCode);
  const codeToInject = injectionIndex === userCode.length ? `\n${injectedCode}` : injectedCode;
  return `${userCode.slice(0, injectionIndex)}${codeToInject}${userCode.slice(injectionIndex)}`;
}
