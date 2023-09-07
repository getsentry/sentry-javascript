import * as Sentry from '@sentry/browser';
import * as Redux from 'redux';

import { createReduxEnhancer } from '../src/redux';

const mockAddBreadcrumb = jest.fn();
const mockSetContext = jest.fn();

jest.mock('@sentry/browser', () => ({
  ...jest.requireActual('@sentry/browser'),
}));

afterEach(() => {
  mockAddBreadcrumb.mockReset();
  mockSetContext.mockReset();
});

describe('Redux State Attachments', () => {
  it('attaches Redux state to Sentry scope', () => {
    const enhancer = createReduxEnhancer();

    const initialState = {
      value: 'initial',
    };

    const store = Redux.createStore((state = initialState) => state, enhancer);

    const updateAction = { type: 'UPDATE_VALUE', value: 'updated' };

    store.dispatch(updateAction);

    const error = new Error('test');
    Sentry.captureException(error);

    Sentry.configureScope(scope => {
      expect(scope.getAttachments()).toContainEqual(
        expect.objectContaining({
          filename: 'redux_state.json',
          data: JSON.stringify({
            value: 'updated',
          }),
        }),
      );
    });
  });

  it('does not attach when attachReduxState is false', () => {
    const enhancer = createReduxEnhancer({ attachReduxState: false });

    const initialState = {
      value: 'initial',
    };

    const store = Redux.createStore((state = initialState) => state, enhancer);

    const updateAction = { type: 'UPDATE_VALUE', value: 'updated' };

    store.dispatch(updateAction);

    const error = new Error('test');
    Sentry.captureException(error);

    Sentry.configureScope(scope => {
      expect(scope.getAttachments()).not.toContainEqual(
        expect.objectContaining({
          filename: 'redux_state.json',
          data: expect.anything(),
        }),
      );
    });
  });

  it('does not attach when state.type is not redux', () => {
    const enhancer = createReduxEnhancer();

    const initialState = {
      value: 'initial',
    };

    Redux.createStore((state = initialState) => state, enhancer);

    Sentry.configureScope(scope => {
      scope.setContext('state', {
        state: {
          type: 'not_redux',
          value: {
            value: 'updated',
          },
        },
      });
    });

    const error = new Error('test');
    Sentry.captureException(error);

    Sentry.configureScope(scope => {
      expect(scope.getAttachments()).not.toContainEqual(
        expect.objectContaining({
          filename: 'redux_state.json',
          data: expect.anything(),
        }),
      );
    });
  });
});
