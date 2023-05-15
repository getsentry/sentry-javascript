export type ServerComponentContext = {
  componentRoute: string;
  componentType: string;
  sentryTraceHeader?: string;
  baggageHeader?: string;
};

export type VercelCronsConfig = { path?: string; schedule?: string }[] | undefined;
