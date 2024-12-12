import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

class WithErrorIndexRoute extends Route {
  public model(): Promise<void> {
    return Promise.reject('Test error');
  }
}

export default instrumentRoutePerformance(WithErrorIndexRoute);
