import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';
import timeout from '../../helpers/utils';

const SLOW_TRANSITION_WAIT = 1500;

class SlowLoadingRoute extends Route {
  public beforeModel(): Promise<void> {
    return timeout(SLOW_TRANSITION_WAIT / 3);
  }

  public model(): Promise<void> {
    return timeout(SLOW_TRANSITION_WAIT / 3);
  }

  public afterModel(): Promise<void> {
    return timeout(SLOW_TRANSITION_WAIT / 3);
  }

  public setupController(...rest: Parameters<Route['setupController']>): ReturnType<Route['setupController']> {
    super.setupController(...rest);
  }
}

export default instrumentRoutePerformance(SlowLoadingRoute);
