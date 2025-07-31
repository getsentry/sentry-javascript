import Controller from '@ember/controller';
import { action } from '@ember/object';
import { scheduleOnce } from '@ember/runloop';
import { tracked } from '@glimmer/tracking';
import { Promise } from 'rsvp';

export default class IndexController extends Controller {
  @tracked public showComponents = false;

  @action
  public createError(): void {
    // @ts-expect-error this is fine
    this.nonExistentFunction();
  }

  @action
  public createEmberError(): void {
    throw new Error('Whoops, looks like you have an EmberError');
  }

  @action
  public createCaughtEmberError(): void {
    try {
      throw new Error('Looks like you have a caught EmberError');
    } catch {
      // do nothing
    }
  }

  @action
  public createFetchError(): void {
    void fetch('http://doesntexist.example');
  }

  @action
  public createAfterRenderError(): void {
    function throwAfterRender(): void {
      throw new Error('After Render Error');
    }
    scheduleOnce('afterRender', null, throwAfterRender);
  }

  @action
  public createRSVPRejection(): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      reject('Promise rejected');
    });
    return promise;
  }

  @action
  public createRSVPError(): Promise<void> {
    const promise = new Promise<void>(() => {
      throw new Error('Error within RSVP Promise');
    });
    return promise;
  }

  @action
  public toggleShowComponents(): void {
    this.showComponents = !this.showComponents;
  }
}
