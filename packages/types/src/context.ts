export type Context = Record<string, unknown> | boolean | string | number | unknown[];
export type Contexts = Record<string, Context>;
export type ContextSetterCallback = (existingContext: Context | null) => Context | null;
