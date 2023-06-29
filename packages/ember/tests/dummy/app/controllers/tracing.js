import Controller from '@ember/controller';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class TracingController extends Controller {
  @service router;

  @action
  navigateToSlowRoute() {
    return this.router.transitionTo('slow-loading-route');
  }
}
