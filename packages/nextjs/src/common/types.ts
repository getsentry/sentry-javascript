export type ServerComponentContext = {
  componentRoute: string;
  componentType: string;
  sentryTraceHeader?: string;
  baggageHeader?: string;
};
