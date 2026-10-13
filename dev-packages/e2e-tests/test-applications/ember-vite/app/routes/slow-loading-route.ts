import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

import timeout from '../helpers/utils';

const SLOW_TRANSITION_WAIT = 1500;

class SlowDefaultLoadingRoute extends Route {
  beforeModel(): Promise<void> {
    return timeout(SLOW_TRANSITION_WAIT / 3);
  }

  model(): Promise<void> {
    return timeout(SLOW_TRANSITION_WAIT / 3);
  }

  afterModel(): Promise<void> {
    return timeout(SLOW_TRANSITION_WAIT / 3);
  }

  setupController(...rest: Parameters<Route['setupController']>): ReturnType<Route['setupController']> {
    super.setupController(...rest);
  }
}

export default instrumentRoutePerformance(SlowDefaultLoadingRoute);
