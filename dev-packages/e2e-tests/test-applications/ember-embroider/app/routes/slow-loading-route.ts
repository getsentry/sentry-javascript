import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

class SlowLoadingRouteRoute extends Route {
  beforeModel() {
    return new Promise<void>(resolve => {
      setTimeout(() => {
        resolve();
      }, 250);
    });
  }

  model() {
    return new Promise<void>(resolve => {
      setTimeout(() => {
        resolve();
      }, 250);
    });
  }

  afterModel() {
    return new Promise<void>(resolve => {
      setTimeout(() => {
        resolve();
      }, 250);
    });
  }
}

export default instrumentRoutePerformance(SlowLoadingRouteRoute);
