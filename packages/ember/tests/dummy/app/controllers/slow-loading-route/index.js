import Controller from '@ember/controller';
import { computed } from '@ember/object';

export default class SlowLoadingRouteController extends Controller {
  @computed()
  get slowLoadingTemplateOnlyItems() {
    return new Array(2000).fill(0).map((_, index) => index);
  }
}
