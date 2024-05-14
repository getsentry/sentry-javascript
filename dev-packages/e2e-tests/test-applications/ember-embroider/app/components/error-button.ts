import { action } from '@ember/object';
import Component from '@glimmer/component';

export default class ErrorButtonComponent extends Component {
  @action
  throwGenericJavascriptError() {
    // @ts-expect-error This is fine
    this.nonExistentFunction();
  }
}
