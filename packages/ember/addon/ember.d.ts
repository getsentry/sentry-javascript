import Ember from 'ember';
declare module 'ember' {
  namespace Ember {
    export function subscribe(pattern: string, object: {}): any;
  }
}
