import EmberRouter from '@ember/routing/router';

import config from './config/environment';

export default class Router extends EmberRouter {
  public location = config.locationType;
  public rootURL = config.rootURL;
}

// This is a false positive of the eslint rule
// eslint-disable-next-line array-callback-return
Router.map(function () {
  this.route('tracing');
  this.route('replay');
  this.route('slow-loading-route', function () {
    this.route('index', { path: '/' });
  });
});
