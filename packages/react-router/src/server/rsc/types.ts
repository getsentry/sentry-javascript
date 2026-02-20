export interface ServerComponentContext {
  /** The parameterized route path (e.g., "/users/:id") */
  componentRoute: string;
  componentType: 'Page' | 'Layout' | 'Error' | 'Unknown';
}

export interface WrapServerFunctionOptions {
  /** Custom span name. Defaults to `serverFunction/{functionName}` */
  name?: string;
  attributes?: Record<string, unknown>;
}
