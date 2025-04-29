import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';
import timeout from '../../helpers/utils';

class WithLoadingIndexRoute extends Route {
  public model(): Promise<void> {
    return timeout(1000);
  }
}

export default instrumentRoutePerformance(WithLoadingIndexRoute);
