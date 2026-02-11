import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SlowLoadingRouteIndexRoute extends Route {
  async beforeModel(): Promise<void> {
    await sleep(500);
  }

  async model(): Promise<{ loaded: boolean }> {
    await sleep(2500);
    return { loaded: true };
  }

  async afterModel(): Promise<void> {
    await sleep(500);
  }
}

export default instrumentRoutePerformance(SlowLoadingRouteIndexRoute);
