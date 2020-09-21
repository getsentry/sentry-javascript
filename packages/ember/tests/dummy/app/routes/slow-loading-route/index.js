import Route from '@ember/routing/route';
import timeout from '../../helpers/utils';
import { instrumentRoutePerformance } from '@sentry/ember';

const SLOW_TRANSITION_WAIT = 1500;

class SlowLoadingRoute extends Route {
  beforeModel() {
    return timeout(SLOW_TRANSITION_WAIT / 3);
  }

  model() {
    return timeout(SLOW_TRANSITION_WAIT / 3);
  }

  afterModel() {
    return timeout(SLOW_TRANSITION_WAIT / 3);
  }

  setupController() {
    super.setupController();
  }
}

export default instrumentRoutePerformance(SlowLoadingRoute);
