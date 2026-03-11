import type { Request, Response } from 'express';

export interface HttpFunction {
  (req: Request, res: Response): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface EventFunction {
  (data: Record<string, any>, context: Context): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface EventFunctionWithCallback {
  // oxlint-disable-next-line typescript/no-explicit-any
  (data: Record<string, any>, context: Context, callback: Function): any;
}

export interface CloudEventFunction {
  (cloudevent: CloudEventsContext): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface CloudEventFunctionWithCallback {
  // oxlint-disable-next-line typescript/no-explicit-any
  (cloudevent: CloudEventsContext, callback: Function): any;
}

export interface CloudFunctionsContext {
  eventId?: string;
  timestamp?: string;
  eventType?: string;
  resource?: string;
}

export interface CloudEventsContext {
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  id: string;
  specversion: string;
  type: string;
  source: string;
  time?: string;
  schemaurl?: string;
  contenttype?: string;
}

export type Context = CloudFunctionsContext | CloudEventsContext;

export interface WrapperOptions {
  flushTimeout: number;
}

export type { Request, Response };
