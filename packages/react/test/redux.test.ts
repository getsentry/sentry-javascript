import * as Sentry from '@sentry/browser';
import type { Scope } from '@sentry/types';
import * as Redux from 'redux';

import { createReduxEnhancer } from '../src/redux';

const mockAddBreadcrumb = jest.fn();
const mockSetContext = jest.fn();

jest.mock('@sentry/browser', () => ({
  ...jest.requireActual('@sentry/browser'),
  configureScope: (callback: (scope: any) => Partial<Scope>) =>
    callback({
      addBreadcrumb: mockAddBreadcrumb,
      setContext: mockSetContext,
    }),
}));

afterEach(() => {
  mockAddBreadcrumb.mockReset();
  mockSetContext.mockReset();
});

describe('createReduxEnhancer', () => {
  it('logs redux action as breadcrumb', () => {
    const enhancer = createReduxEnhancer();

    const initialState = {};

    const store = Redux.createStore(() => initialState, enhancer);

    const action = { type: 'TEST_ACTION' };
    store.dispatch(action);

    expect(mockAddBreadcrumb).toBeCalledWith({
      category: 'redux.action',
      data: action,
      type: 'info',
    });
  });

  it('sets latest state on to scope', () => {
    const enhancer = createReduxEnhancer();

    const initialState = {
      value: 'initial',
    };
    const ACTION_TYPE = 'UPDATE_VALUE';

    const store = Redux.createStore(
      (state: Record<string, unknown> = initialState, action: { type: string; newValue: any }) => {
        if (action.type === ACTION_TYPE) {
          return {
            ...state,
            value: action.newValue,
          };
        }
        return state;
      },
      enhancer,
    );

    const updateAction = { type: ACTION_TYPE, newValue: 'updated' };
    store.dispatch(updateAction);

    expect(mockSetContext).toBeCalledWith('state', {
      state: {
        type: 'redux',
        value: {
          value: 'updated',
        },
      },
    });
  });

  describe('transformers', () => {
    it('transforms state', () => {
      const enhancer = createReduxEnhancer({
        stateTransformer: state => ({
          ...state,
          superSecret: 'REDACTED',
        }),
      });

      const initialState = {
        superSecret: 'SECRET!',
        value: 123,
      };

      Redux.createStore((state = initialState) => state, enhancer);

      expect(mockSetContext).toBeCalledWith('state', {
        state: {
          type: 'redux',
          value: {
            superSecret: 'REDACTED',
            value: 123,
          },
        },
      });
    });

    it('clears state if transformer returns null', () => {
      const enhancer = createReduxEnhancer({
        stateTransformer: () => null,
      });

      const initialState = {
        superSecret: 'SECRET!',
        value: 123,
      };

      Redux.createStore((state = initialState) => state, enhancer);

      // Check that state is cleared
      expect(mockSetContext).toBeCalledWith('state', null);
    });

    it('transforms actions', () => {
      const ACTION_TYPES = {
        SAFE: 'SAFE_ACTION',
        SECRET: 'SUPER_SECRET_ACTION',
      };

      const enhancer = createReduxEnhancer({
        actionTransformer: action => {
          if (action.type === ACTION_TYPES.SECRET) {
            return {
              ...action,
              secret: 'I love pizza',
            };
          }
          return action;
        },
      });

      const initialState = {};

      const store = Redux.createStore(() => initialState, enhancer);

      store.dispatch({
        secret: 'The Nuclear Launch Code is: Pizza',
        type: ACTION_TYPES.SECRET,
      });

      expect(mockAddBreadcrumb).toBeCalledWith({
        category: 'redux.action',
        data: {
          secret: 'I love pizza',
          type: ACTION_TYPES.SECRET,
        },
        type: 'info',
      });

      const safeAction = {
        secret: 'Not really a secret am I',
        type: ACTION_TYPES.SAFE,
      };
      store.dispatch(safeAction);

      expect(mockAddBreadcrumb).toBeCalledWith({
        category: 'redux.action',
        data: safeAction,
        type: 'info',
      });

      // first time is redux initialize
      expect(mockAddBreadcrumb).toBeCalledTimes(3);
    });

    it("doesn't send action if transformer returns null", () => {
      const enhancer = createReduxEnhancer({
        actionTransformer: action => {
          if (action.type === 'COCA_COLA_RECIPE') {
            return null;
          }
          return action;
        },
      });

      const initialState = {};

      const store = Redux.createStore((state = initialState) => state, enhancer);

      const safeAction = {
        type: 'SAFE',
      };
      store.dispatch(safeAction);

      const secretAction = {
        cocaColaRecipe: {
          everythingElse: '10ml',
          sugar: '990ml',
        },
        type: 'COCA_COLA_RECIPE',
      };
      store.dispatch(secretAction);

      // first time is redux initialize
      expect(mockAddBreadcrumb).toBeCalledTimes(2);
      expect(mockAddBreadcrumb).toBeCalledWith({
        category: 'redux.action',
        data: safeAction,
        type: 'info',
      });
    });
  });

  it('configureScopeWithState is passed latest state', () => {
    const configureScopeWithState = jest.fn();
    const enhancer = createReduxEnhancer({
      configureScopeWithState,
    });

    const initialState = {
      value: 'outdated',
    };

    const UPDATE_VALUE = 'UPDATE_VALUE';

    const store = Redux.createStore(
      (state: Record<string, unknown> = initialState, action: { type: string; value: any }) => {
        if (action.type === UPDATE_VALUE) {
          return {
            ...state,
            value: action.value,
          };
        }
        return state;
      },
      enhancer,
    );

    store.dispatch({
      type: UPDATE_VALUE,
      value: 'latest',
    });

    let scopeRef;
    Sentry.configureScope(scope => (scopeRef = scope));

    expect(configureScopeWithState).toBeCalledWith(scopeRef, {
      value: 'latest',
    });
  });
});
