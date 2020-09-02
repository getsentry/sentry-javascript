import Route from '@ember/routing/route';
import timeout from '../helpers/utils';
import { SLOW_TRANSITION_WAIT } from 'dummy/tests/constants';

export default class SlowLoadingRoute extends Route {
  model() {
    return timeout(SLOW_TRANSITION_WAIT);
  }
}
