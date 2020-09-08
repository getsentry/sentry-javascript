import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import EmberError from '@ember/error';
import { scheduleOnce } from '@ember/runloop';
import RSVP from 'rsvp';

export default class IndexController extends Controller {
  @tracked showComponents;

  @action
  createError() {
    this.nonExistentFunction();
  }

  @action
  createEmberError() {
    throw new EmberError('Whoops, looks like you have an EmberError');
  }

  @action
  createCaughtEmberError() {
    try {
      throw new EmberError('Looks like you have a caught EmberError');
    } catch (e) {
      console.log(e);
    }
  }

  @action
  createFetchError() {
    fetch('http://doesntexist.example');
  }

  @action
  createAfterRenderError() {
    function throwAfterRender() {
      throw new Error('After Render Error');
    }
    scheduleOnce('afterRender', throwAfterRender);
  }

  @action
  createRSVPRejection() {
    const promise = new RSVP.Promise((resolve, reject) => {
      reject('Promise rejected');
    });
    return promise;
  }

  @action
  createRSVPError() {
    const promise = new RSVP.Promise(() => {
      throw new Error('Error within RSVP Promise');
    });
    return promise;
  }

  @action
  toggleShowComponents() {
    this.showComponents = !this.showComponents;
  }
}
