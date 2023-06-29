import Component from '@glimmer/component';
import RouterService from '@ember/routing/router-service';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

interface Args {
  route: string;
}

/*
 Note: We use this custom component instead of the built-in `<LinkTo>`,
 as that is an ember component in older versions, and a glimmer component in newer versions.

 Since glimmer components are, as of now, not instrumented, this leads to different test results.
*/
export default class LinkComponent extends Component<Args> {
  @service declare router: RouterService;

  get href() {
    return this.router.urlFor(this.args.route);
  }

  get isActive() {
    return this.router.currentRouteName === this.args.route;
  }

  @action
  onClick(event: MouseEvent) {
    event.preventDefault();

    this.router.transitionTo(this.args.route);
  }
}
