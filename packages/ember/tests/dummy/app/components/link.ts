import { action } from '@ember/object';
import type RouterService from '@ember/routing/router-service';
import { inject as service } from '@ember/service';
import Component from '@glimmer/component';

interface Args {
  route: string;
}

/*
 Note: We use this custom component instead of the built-in `<LinkTo>`,
 as that is an ember component in older versions, and a glimmer component in newer versions.

 Since glimmer components are, as of now, not instrumented, this leads to different test results.
*/
export default class LinkComponent extends Component<Args> {
  @service declare public router: RouterService;

  public get href(): string {
    return this.router.urlFor(this.args.route);
  }

  public get isActive(): boolean {
    return this.router.currentRouteName === this.args.route;
  }

  @action
  public onClick(event: MouseEvent): void {
    event.preventDefault();

    void this.router.transitionTo(this.args.route);
  }
}
