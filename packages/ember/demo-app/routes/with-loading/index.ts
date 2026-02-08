import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class WithLoadingIndexRoute extends Route {
  async beforeModel(): Promise<void> {
    await sleep(100);
  }

  async model(): Promise<{ loaded: boolean }> {
    await sleep(200);
    return { loaded: true };
  }

  async afterModel(): Promise<void> {
    await sleep(100);
  }
}

export default instrumentRoutePerformance(WithLoadingIndexRoute);
