export type ServerComponentContext = {
  componentRoute: string;
  componentType: string;
  // Ideally we shouldn't have to pass these headers in and we should be able to call headers() inside of the wrapper
  // but it doesn't seem to work for third party modules at this point in time.
  sentryTraceHeader?: string;
  baggageHeader?: string;
};
