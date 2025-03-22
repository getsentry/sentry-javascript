export interface SupabaseClient {
  prototype: {
    from: (table: string) => PostgrestQueryBuilder;
  };
}

export interface PostgrestQueryBuilder {
  select: (...args: unknown[]) => PostgrestFilterBuilder;
  insert: (...args: unknown[]) => PostgrestFilterBuilder;
  upsert: (...args: unknown[]) => PostgrestFilterBuilder;
  update: (...args: unknown[]) => PostgrestFilterBuilder;
  delete: (...args: unknown[]) => PostgrestFilterBuilder;
}

export interface PostgrestFilterBuilder {
  method: string;
  headers: Record<string, string>;
  url: URL;
  schema: string;
  body: any;
}

export interface SupabaseResponse {
  status?: number;
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
