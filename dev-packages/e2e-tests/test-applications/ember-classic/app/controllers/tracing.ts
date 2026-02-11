import Controller from '@ember/controller';
import { action } from '@ember/object';
import type RouterService from '@ember/routing/router-service';
import { inject as service } from '@ember/service';

export default class TracingController extends Controller {
  @service declare public router: RouterService;

  @action
  public navigateToSlowRoute(): void {
    void this.router.transitionTo('slow-loading-route');
  }
}
