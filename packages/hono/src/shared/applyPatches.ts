import type { Env, Hono } from 'hono';
import { patchAppUse } from '../shared/patchAppUse';
import { patchRoute } from '../shared/patchRoute';

/**
 * Applies necessary patches to the Hono app to ensure that Sentry can properly trace middleware and route handlers.
 */
export function applyPatches<E extends Env>(app: Hono<E>): void {
  // `app.use` (instance own property) — wraps middleware at registration time on this instance.
  patchAppUse(app);

  //`HonoBase.prototype.route` — wraps sub-app middleware at mount time so that route groups (`app.route('/prefix', subApp)`) are also instrumented.
  patchRoute(app);
}
