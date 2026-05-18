/**
 * A function that is possibly wrapped by Sentry.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type WrappedFunction<T extends Function = Function> = T & {
  __sentry_wrapped__?: WrappedFunction<T>;
  __sentry_original__?: T;
};
