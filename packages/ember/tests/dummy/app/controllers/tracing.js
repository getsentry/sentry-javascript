import Controller from '@ember/controller';
import { action } from '@ember/object';

export default class TracingController extends Controller {
  @action
  navigateToSlowRoute() {
    return this.transitionToRoute('slow-loading-route');
  }
}
