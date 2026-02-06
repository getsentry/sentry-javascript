import type { AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT, AUTH_OPERATIONS_TO_INSTRUMENT } from './constants';

export interface SupabaseClientConstructorType {
  prototype: {
    from: (table: string) => PostgRESTQueryBuilder;
    schema: (schema: string) => { rpc: (...args: unknown[]) => Promise<unknown> };
    rpc: (...args: unknown[]) => Promise<unknown>;
  };
  rpc: (fn: string, params: Record<string, unknown>) => Promise<unknown>;
}

type AuthOperationFn = (...args: unknown[]) => Promise<unknown>;
type AuthOperationName = (typeof AUTH_OPERATIONS_TO_INSTRUMENT)[number];
type AuthAdminOperationName = (typeof AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT)[number];
type PostgRESTQueryOperationFn = (...args: unknown[]) => PostgRESTFilterBuilder;

export type { AuthOperationFn, AuthOperationName, AuthAdminOperationName, PostgRESTQueryOperationFn };

export interface SupabaseClientInstance {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<unknown>;
  auth: {
    admin: Record<AuthAdminOperationName, AuthOperationFn>;
  } & Record<AuthOperationName, AuthOperationFn>;
}

export interface PostgRESTQueryBuilder {
  [key: string]: PostgRESTQueryOperationFn;
}

export interface PostgRESTFilterBuilder {
  method: string;
  headers: Record<string, string>;
  url: URL;
  schema: string;
  body: unknown;
}

export interface SupabaseResponse {
  status?: number;
  data?: Array<{
    msg_id?: number;
    read_ct?: number; // PGMQ read count for retry tracking
    enqueued_at?: string;
    vt?: number; // Visibility timeout
    message?: {
      [key: string]: unknown; // Allow other message properties
      _sentry?: {
        sentry_trace?: string;
        baggage?: string;
      };
    };
  }> | null;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export interface SupabaseError extends Error {
  code?: string;
  details?: unknown;
}

export interface SupabaseBreadcrumb {
  type: string;
  category: string;
  message: string;
  data?: {
    query?: string[];
    body?: Record<string, unknown>;
  };
}

export interface PostgRESTProtoThenable {
  then: <T>(
    onfulfilled?: ((value: T) => T | PromiseLike<T>) | null,
    onrejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
  ) => Promise<T>;
}

export type SentryInstrumented<T> = T & {
  __SENTRY_INSTRUMENTED__?: boolean;
};
