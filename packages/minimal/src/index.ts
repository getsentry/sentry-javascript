import { getCurrentHub, Hub, Scope } from '@sentry/hub';
import {
  Breadcrumb,
  CaptureContext,
  CustomSamplingContext,
  Event,
  Extra,
  Extras,
  Primitive,
  Severity,
  SeverityLevel,
  Transaction,
  TransactionContext,
  User,
} from '@sentry/types';

/**
 * This calls a function on the current hub.
 * @param method function to call on hub.
 * @param args to pass to function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function callOnHub<T>(method: string, ...args: any[]): T {
  const hub = getCurrentHub();
  if (hub && hub[method as keyof Hub]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (hub[method as keyof Hub] as any)(...args);
  }
  throw new Error(`No hub defined or ${method} was not found on the hub, please open a bug report.`);
}
