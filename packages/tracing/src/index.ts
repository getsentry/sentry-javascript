import { BrowserTracing } from './browser';
import { addExtensionMethods } from './hubextensions';
import * as ApmIntegrations from './integrations';

// tslint:disable-next-line: variable-name
const Integrations = { ...ApmIntegrations, BrowserTracing };

export { Integrations };
export { Span, TRACEPARENT_REGEXP } from './span';
export { Transaction } from './transaction';

export { SpanStatus } from './spanstatus';

// We are patching the global object with our hub extension methods
addExtensionMethods();
