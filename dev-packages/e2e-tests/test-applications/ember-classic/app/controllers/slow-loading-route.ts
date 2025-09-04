import Controller from '@ember/controller';
import { action } from '@ember/object';
import type RouterService from '@ember/routing/router-service';
import { inject as service } from '@ember/service';

export default class SlowLoadingRouteController extends Controller {
  @service declare public router: RouterService;

  @action
  public back(): void {
    void this.router.transitionTo('tracing');
  }
}
