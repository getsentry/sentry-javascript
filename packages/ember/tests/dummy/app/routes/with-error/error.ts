import Route from '@ember/routing/route';

export default class WithErrorErrorRoute extends Route {
  public model(): void {
    // Just swallow the error...
  }

  public setupController() {
    // Just swallow the error...
  }
}
