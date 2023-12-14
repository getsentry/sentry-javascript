import type { Request, Response } from 'express';

export interface HttpFunction {
  (req: Request, res: Response): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface EventFunction {
  (data: Record<string, any>, context: Context): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface EventFunctionWithCallback {
  // biome-ignore lint/complexity/noBannedTypes: Disable
  (data: Record<string, any>, context: Context, callback: Function): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface CloudEventFunction {
  (cloudevent: CloudEventsContext): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface CloudEventFunctionWithCallback {
  // biome-ignore lint/complexity/noBannedTypes: Disable
  (cloudevent: CloudEventsContext, callback: Function): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface CloudFunctionsContext {
  eventId?: string;
  timestamp?: string;
  eventType?: string;
  resource?: string;
}

export interface CloudEventsContext {
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  type?: string;
  specversion?: string;
  source?: string;
  id?: string;
  time?: string;
  schemaurl?: string;
  contenttype?: string;
}

export type Context = CloudFunctionsContext | CloudEventsContext;

export interface WrapperOptions {
  flushTimeout: number;
}

export type { Request, Response };
