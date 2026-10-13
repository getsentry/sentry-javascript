import EmberRouter from '@embroider/router';
import config from 'ember-vite/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  this.route('tracing');
  this.route('replay');
  this.route('slow-loading-route', function () {
    this.route('index', { path: '/' });
  });
});
