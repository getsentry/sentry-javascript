/**
 * Type tests for `ExportedHandler`'s 4th generic — `Props` for `ExecutionContext<Props>`.
 *
 * A `Props`-typed handler must still be accepted by `withSentry`, keep its exact type,
 * and have its env inferred. Runs in every program, since both `@cloudflare/workers-types`
 * v4 and v5 carry the `Props` generic.
 */
import { withSentry } from '@sentry/cloudflare';
import { expectTypeOf } from 'vitest';

interface PropsEnv {
  SENTRY_DSN: string;
}

interface MyProps {
  jobId: string;
}

const propsHandler: ExportedHandler<PropsEnv, unknown, unknown, MyProps> = {
  async fetch(_, env, ctx) {
    expectTypeOf(ctx.props.jobId).toEqualTypeOf<string>();
    void env.SENTRY_DSN;
    return new Response('ok');
  },
};

// A pre-typed handler with `ExecutionContext<Props>` is accepted and its env inferred.
export const props = withSentry(env => {
  expectTypeOf(env).toEqualTypeOf<PropsEnv>();
  return { dsn: env.SENTRY_DSN };
}, propsHandler);

// The wrapped handler keeps its exact type, including the Props.
expectTypeOf(props).toEqualTypeOf<ExportedHandler<PropsEnv, unknown, unknown, MyProps>>();

// A `satisfies` handler literal with `ExecutionContext<Props>` works too.
export const propsSatisfies = withSentry(
  env => {
    expectTypeOf(env).toEqualTypeOf<PropsEnv>();
    return { dsn: env.SENTRY_DSN };
  },
  {
    async fetch(_, env, ctx) {
      expectTypeOf(env).toEqualTypeOf<PropsEnv>();
      expectTypeOf(ctx.props.jobId).toEqualTypeOf<string>();
      void env.SENTRY_DSN;
      return new Response('ok');
    },
  } satisfies ExportedHandler<PropsEnv, unknown, unknown, MyProps>,
);
