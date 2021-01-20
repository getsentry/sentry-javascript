import { Context } from './context';

/**
 * App context describes the application. As opposed to the runtime,
 * this is the actual application that was running and carries metadata about the current session.
 * @external https://develop.sentry.dev/sdk/event-payloads/contexts/#app-context
 */
export interface AppContext extends Context {
  /**
   * Formatted UTC timestamp when the user started the application.
   */
  app_start_time?: number;

  /**
   * Application-specific device identifier.
   */
  device_app_hash?: string;

  /**
   * String identifying the kind of build. For example, testflight.
   */
  build_type?: string;

  /**
   * Version-independent application identifier, often a dotted bundle ID.
   */
  app_identifier?: string;

  /**
   * Human readable application name, as it appears on the platform.
   */
  app_name?: string;

  /**
   * Human readable application version, as it appears on the platform.
   */
  app_version?: string;

  /**
   * Internal build identifier, as it appears on the platform.
   */
  app_build?: string;
}
