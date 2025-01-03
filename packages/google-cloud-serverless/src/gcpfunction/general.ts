import type { Request, Response } from 'express';

export type HttpFunction = (req: Request, res: Response) => void;

export type EventFunction = (data: Record<string, unknown>, context: Context) => void;

export type EventFunctionWithCallback = (
  data: Record<string, unknown>,
  context: Context,
  // eslint-disable-next-line @typescript-eslint/ban-types
  callback: Function,
) => void;

export type CloudEventFunction = (cloudevent: CloudEventsContext) => void;

// eslint-disable-next-line @typescript-eslint/ban-types
export type CloudEventFunctionWithCallback = (cloudevent: CloudEventsContext, callback: Function) => void;

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
