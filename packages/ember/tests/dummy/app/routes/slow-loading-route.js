import Route from '@ember/routing/route';
import timeout from '../helpers/utils';

export default class SlowLoadingRoute extends Route {
  model() {
    return timeout(3000);
  }
}
