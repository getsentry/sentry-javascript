import { Context } from './context';

/**
 * Browser context carries information about the browser or user agent for web-related errors.
 * This can either be the browser this event occurred in or the user agent of a web request that triggered the event.
 * @external https://develop.sentry.dev/sdk/event-payloads/contexts/#browser-context
 */
export interface BrowserContext extends Context {
  /**
   * Display name of the browser application.
   */
  name: string;

  /**
   * Version string of the browser.
   */
  version?: string;
}
