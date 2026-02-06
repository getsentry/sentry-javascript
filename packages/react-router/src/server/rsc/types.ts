export interface ServerComponentContext {
  /** The parameterized route path (e.g., "/users/:id") */
  componentRoute: string;
  componentType: 'Page' | 'Layout' | 'Loading' | 'Error' | 'Template' | 'Not-found' | 'Unknown';
}

export interface WrapServerFunctionOptions {
  /** Custom span name. Defaults to `serverFunction/{functionName}` */
  name?: string;
  attributes?: Record<string, unknown>;
}
