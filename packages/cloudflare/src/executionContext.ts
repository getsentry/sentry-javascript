import type { ExecutionContext } from '@cloudflare/workers-types';

/**
 * A structural subset of `ExecutionContext` that is compatible with both `@cloudflare/workers-types`
 * v4 and v5.
 *
 * v5 added `exports` and `tracing` as required members. Referencing the full `ExecutionContext` in
 * public input positions would force consumers on v4 (still allowed by our `peerDependencies` range)
 * to provide members their types don't have. We only ever use `waitUntil` (plus a runtime
 * `'storage' in ctx` check), so picking the members that exist in both majors keeps a context
 * constructed against either version assignable here.
 */
export type ExecutionContextCompat = Pick<ExecutionContext, 'waitUntil' | 'passThroughOnException'> | ExecutionContext;
