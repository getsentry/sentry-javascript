/** The `Query` instance postgres.js passes as `self` to `Query.prototype.handle`. */
export interface PostgresQuery {
  strings?: string[];
  executed?: boolean;
  resolve?: (...args: unknown[]) => unknown;
  reject?: (...args: unknown[]) => unknown;
}

export interface PostgresJsQueryContext {
  arguments?: unknown[];
  self?: PostgresQuery;
  result?: unknown;
  error?: unknown;
}

// postgres.js parses `host`/`port` into arrays (it can connect to multiple
// hosts); the `Connection` factory receives this parsed options object.
export interface PostgresParsedOptions {
  host?: string[];
  port?: number[];
  database?: string;
}
