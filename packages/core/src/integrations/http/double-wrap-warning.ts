import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../../utils/debug-logger';
import type { HttpModuleExport } from './types';

const isOtelWrapped = (fn: Function & { __unwrap?: Function }): fn is Function & { __unwrap: Function } =>
  typeof fn.__unwrap === 'function';

// exported for tess
export const warning =
  'Double-wrapped http.client detected. Either disable spans in Sentry.httpIntegration, or disable the OpenTelemetry HTTP instrumentation. See: https://docs.sentry.io/platforms/javascript/guides/express/opentelemetry/custom-setup/#custom-http-instrumentation';

let didDoubleWrapWarning = false;
// no-op in non-debug builds
export const doubleWrapWarning = DEBUG_BUILD
  ? (http: HttpModuleExport) => {
      if (!didDoubleWrapWarning) {
        if (isOtelWrapped(http.request) || isOtelWrapped(http.get)) {
          didDoubleWrapWarning = true;
          debug.warn(warning);
        }
      }
    }
  : () => {};
