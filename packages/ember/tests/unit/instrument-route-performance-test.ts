import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';
import sinon from 'sinon';
import { setupSentryTest } from '../helpers/setup-sentry';
import Transition from '@ember/routing/transition';
import Controller from '@ember/controller';

module('Unit | Utility | instrument-route-performance', function (hooks) {
  setupTest(hooks);
  setupSentryTest(hooks);

  test('wrapped Route hooks maintain the current context', function (assert) {
    const beforeModel = sinon.spy();
    const model = sinon.spy();
    const afterModel = sinon.spy();
    const setupController = sinon.spy();

    class DummyRoute extends Route {
      beforeModel() {
        return beforeModel.call(this, ...arguments);
      }

      model() {
        return model.call(this, ...arguments);
      }

      afterModel() {
        return afterModel.call(this, ...arguments);
      }

      setupController() {
        return setupController.call(this, ...arguments);
      }
    }

    const InstrumentedDummyRoute = instrumentRoutePerformance(DummyRoute);

    this.owner.register('route:dummy', InstrumentedDummyRoute);

    const route = this.owner.lookup('route:dummy') as Route;
    const transition = {} as Transition;
    const modelObj = { name: 'test model' };
    const controller = new Controller();

    route.beforeModel(transition);

    assert.ok(beforeModel.calledOn(route), 'The context for `beforeModel` is the route');
    assert.ok(beforeModel.calledWith(transition), 'The arguments for `beforeModel` are passed through');

    route.model(modelObj, transition);

    assert.ok(model.calledOn(route), 'The context for `model` is the route');
    assert.ok(model.calledWith(modelObj, transition), 'The arguments for `model` are passed through');

    route.afterModel(modelObj, transition);

    assert.ok(afterModel.calledOn(route), 'The context for `afterModel` is the route');
    assert.ok(afterModel.calledWith(modelObj, transition), 'The arguments for `afterModel` are passed through');

    route.setupController(controller, modelObj, transition);

    assert.ok(setupController.calledOn(route), 'The context for `setupController` is the route');
    assert.ok(
      setupController.calledWith(controller, modelObj, transition),
      'The arguments for `setupController` are passed through',
    );
  });
});
