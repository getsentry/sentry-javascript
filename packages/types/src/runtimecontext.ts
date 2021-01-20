import { Context } from './context';

/**
 * Runtime context describes a runtime in more detail. Typically,
 * this context is used multiple times if multiple runtimes are involved
 * (for instance, if you have a JavaScript application running on top of JVM).
 * @external https://develop.sentry.dev/sdk/event-payloads/contexts/#runtime-context
 */
export interface RuntimeContext extends Context {
  /**
   * The name of the runtime.
   */
  name: string;

  /**
   * The version identifier of the runtime.
   */
  version?: string;

  /**
   * An unprocessed description string obtained by the runtime.
   * For some well-known runtimes,
   * Sentry will attempt to parse name and version from this string,
   * if they are not explicitly given.
   */
  raw_description?: string;
}
