import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SlowLoadingRoute extends Route {
  async beforeModel(): Promise<void> {
    await sleep(500);
  }

  async model(): Promise<{ items: string[] }> {
    await sleep(1000);
    return { items: ['Item 1', 'Item 2', 'Item 3'] };
  }

  async afterModel(): Promise<void> {
    await sleep(500);
  }
}

export default instrumentRoutePerformance(SlowLoadingRoute);
