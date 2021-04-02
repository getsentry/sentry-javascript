import { BrowserTracing } from './browser';
import { addExtensionMethods } from './hubextensions';
import * as TracingIntegrations from './integrations';

const Integrations = { ...TracingIntegrations, BrowserTracing };

export { Integrations };
export { Span } from './span';
export { Transaction } from './transaction';
export {
  // TODO deprecate old name in v7
  instrumentOutgoingRequests as registerRequestInstrumentation,
  RequestInstrumentationOptions,
  defaultRequestInstrumentationOptions,
} from './browser';
export { SpanStatus } from './spanstatus';
export { IdleTransaction } from './idletransaction';
export { startIdleTransaction } from './hubextensions';

// We are patching the global object with our hub extension methods
addExtensionMethods();

export { addExtensionMethods };

export {
  extractTraceparentData,
  getActiveTransaction,
  hasTracingEnabled,
  stripUrlQueryAndFragment,
  TRACEPARENT_REGEXP,
} from './utils';
