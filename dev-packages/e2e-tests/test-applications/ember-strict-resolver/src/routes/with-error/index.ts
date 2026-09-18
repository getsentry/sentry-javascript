import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

class WithErrorIndexRoute extends Route {
  beforeModel(): void {
    // Nothing - proceed to model
  }

  model(): never {
    throw new Error('Model error');
  }
}

export default instrumentRoutePerformance(WithErrorIndexRoute);
