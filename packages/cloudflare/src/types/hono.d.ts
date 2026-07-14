declare module 'hono' {
  export type Env = {
    Bindings?: unknown;
    Variables?: unknown;
  };

  export class Hono<E extends Env = Env> {
    fetch(
      request: Request,
      env?: E['Bindings'] | {},
      executionCtx?: ExecutionContext,
    ): Response | Promise<Response>;
  }
}
