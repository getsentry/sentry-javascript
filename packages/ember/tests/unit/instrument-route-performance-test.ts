import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';
import sinon from 'sinon'
import { setupSentryTest } from '../helpers/setup-sentry';

module('Unit | Utility | instrument-route-performance', function(hooks) {
  setupTest(hooks);
  setupSentryTest(hooks);

  test('wrapped Route hooks maintain the current context', function(assert) {
    const beforeModel = sinon.spy();
    const model = sinon.spy();
    const afterModel = sinon.spy();
    const setupController = sinon.spy();

    class DummyRoute extends Route {
      beforeModel(...args: any[]) {
        return beforeModel.call(this, ...args);
      }

      model(...args: any[]) {
        return model.call(this, ...args);
      }

      afterModel(...args: any[]) {
        return afterModel.call(this, ...args);
      }

      setupController(...args: any[]) {
        return setupController.call(this, ...args);
      }
    }

    const InstrumentedDummyRoute = instrumentRoutePerformance(DummyRoute);

    this.owner.register('route:dummy', InstrumentedDummyRoute);

    const route = this.owner.lookup('route:dummy');

    route.beforeModel('foo');

    assert.ok(beforeModel.calledOn(route), "The context for `beforeModel` is the route");
    assert.ok(beforeModel.calledWith('foo'), 'The arguments for `beforeModel` are passed through');

    route.model('bar');

    assert.ok(model.calledOn(route), "The context for `model` is the route");
    assert.ok(model.calledWith('bar'), 'The arguments for `model` are passed through');

    route.afterModel('bax');

    assert.ok(afterModel.calledOn(route), "The context for `afterModel` is the route");
    assert.ok(afterModel.calledWith('bax'), 'The arguments for `afterModel` are passed through');

    route.setupController('baz');

    assert.ok(setupController.calledOn(route), "The context for `setupController` is the route");
    assert.ok(setupController.calledWith('baz'), 'The arguments for `setupController` are passed through');
  });
});
