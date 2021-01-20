/**
 * The Contexts Interface provides additional context data.
 * Typically, this is data related to the current user and the environment.
 * For example, the device or application version.
 * @external https://develop.sentry.dev/sdk/event-payloads/contexts/
 */
export type Context = Record<string, unknown>;

export type Contexts = Record<string, Context>;
