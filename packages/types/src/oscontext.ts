import { Context } from './context';

/**
 * OS context describes the operating system on which the event was created.
 * In web contexts, this is the operating system of the browser (generally pulled from the User-Agent string).
 * @external https://develop.sentry.dev/sdk/event-payloads/contexts/#os-context
 */
export interface OsContext extends Context {
  /**
   * The name of the operating system.
   */
  name: string;

  /**
   * The version of the operating system.
   */
  version?: string;

  /**
   * The internal build revision of the operating system.
   */
  build?: string;

  /**
   * An independent kernel version string.
   * This is typically the entire output of the uname syscall.
   */
  kernel_version?: string;

  /**
   * A flag indicating whether the OS has been jailbroken or rooted.
   */
  rooted?: boolean;

  /**
   * An unprocessed description string obtained by the operating system.
   * For some well-known runtimes,
   * Sentry will attempt to parse name and version from this string,
   * if they are not explicitly given.
   */
  raw_description?: string;
}
