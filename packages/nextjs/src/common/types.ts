export type ServerComponentContext = {
  componentRoute: string;
  componentType: string;
  sentryTraceHeader?: string;
  baggageHeader?: string;
};

export type RouteHandlerContext = {
  method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE' | 'PATCH' | 'OPTIONS';
  parameterizedRoute: string;
  sentryTraceHeader?: string;
  baggageHeader?: string;
};
