import type { Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import type { Span } from '@sentry/types';

/**
 * Keep some otel hooks separate from the default client hooks.
 */
export class OtelHooks {
  // eslint-disable-next-line @typescript-eslint/ban-types
  private _hooks: Record<string, Function[]> = {};

  /**
   * Fires when an Otel Span is ended.
   * Receives the Otel Span as argument.
   * Return `false` from the callback to skip this span in Sentry.
   */
  public on(hook: 'spanEnd', callback: (otelSpan: OtelSpan, sentrySpan: Span) => void | false): void;

  /**
   * @inheritdoc
   */
  public on(hook: string, callback: unknown): void {
    if (!this._hooks[hook]) {
      this._hooks[hook] = [];
    }

    // @ts-ignore We assue the types are correct
    this._hooks[hook].push(callback);
  }

  /**
   * Unregister the hook.
   */
  public off(hook: 'spanEnd', callback: (otelSpan: OtelSpan, sentrySpan: Span) => void | false): void;

  /**
   * @inheritdoc
   */
  public off(hook: string, callback: unknown): void {
    if (!this._hooks[hook]) {
      return;
    }

    // @ts-ignore We assue the types are correct
    const index = this._hooks[hook].indexOf(callback);
    if (index > -1) {
      this._hooks[hook].splice(index, 1);
    }
  }

  /**
   * Emit the otel span end hook.
   * Returns `false` if the span should not be sent to Sentry.
   */
  public emit(hook: 'spanEnd', otelSpan: OtelSpan, sentrySpan: Span): void | false;

  /**
   * @inheritdoc
   */
  public emit(hook: string, ...rest: unknown[]): void | false {
    if (this._hooks[hook]) {
      for (const callback of this._hooks[hook]) {
        const cancel = callback(...rest);
        if (cancel === false) {
          return false;
        }
      }
    }
  }
}
