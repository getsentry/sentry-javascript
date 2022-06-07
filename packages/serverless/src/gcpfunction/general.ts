import { Scope } from '@sentry/node';
import { Context as SentryContext } from '@sentry/types';
import type { Request, Response } from 'express';
import { hostname } from 'os';

export interface HttpFunction {
  (req: Request, res: Response): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface EventFunction {
  (data: Record<string, any>, context: Context): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface EventFunctionWithCallback {
  (data: Record<string, any>, context: Context, callback: Function): any; // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
}

export interface CloudEventFunction {
  (cloudevent: CloudEventsContext): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface CloudEventFunctionWithCallback {
  (cloudevent: CloudEventsContext, callback: Function): any; // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
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

/**
 * Enhances the scope with additional event information.
 *
 * @param scope scope
 * @param context event context
 */
export function configureScopeWithContext(scope: Scope, context: Context): void {
  scope.setContext('runtime', {
    name: 'node',
    version: global.process.version,
  });
  scope.setTag('server_name', process.env.SENTRY_NAME || hostname());
  scope.setContext('gcp.function.context', { ...context } as SentryContext);
}

export type { Request, Response };
