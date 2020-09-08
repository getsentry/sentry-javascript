import Controller from '@ember/controller';
import { action } from '@ember/object';

export default class SlowLoadingRouteController extends Controller {
  @action
  back() {
    this.transitionToRoute('tracing');
  }
}
