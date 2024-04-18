import { registerSpanErrorInstrumentation } from './errors';

/**
 * @deprecated Use `registerSpanErrorInstrumentation()` instead. In v9, this function will be removed. Note that you don't need to call this in Node-based SDKs or when using `browserTracingIntegration`.
 */
export function addTracingExtensions(): void {
  registerSpanErrorInstrumentation();
}
