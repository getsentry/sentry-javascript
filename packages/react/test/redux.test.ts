import * as Sentry from '@sentry/browser';
import * as SentryCore from '@sentry/core';
import * as Redux from 'redux';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReduxEnhancer } from '../src/redux';

const mockSetContext = vi.fn();
const mockGlobalScopeAddEventProcessor = vi.fn();

vi.mock('@sentry/core', async requireActual => ({
  ...(await requireActual()),
  getCurrentScope() {
    return {
      setContext: mockSetContext,
    };
  },
  getGlobalScope() {
    return {
      addEventProcessor: mockGlobalScopeAddEventProcessor,
    };
  },
  addEventProcessor: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

afterEach(() => {
  mockSetContext.mockReset();
  mockGlobalScopeAddEventProcessor.mockReset();
});

describe('createReduxEnhancer', () => {
  let mockAddBreadcrumb: Mock;

  beforeEach(() => {
    mockAddBreadcrumb = SentryCore.addBreadcrumb as unknown as Mock;
    mockAddBreadcrumb.mockReset();
  });

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
    const configureScopeWithState = vi.fn();
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

    const scopeRef = Sentry.getCurrentScope();

    expect(configureScopeWithState).toBeCalledWith(scopeRef, {
      value: 'latest',
    });
  });

  describe('Redux State Attachments', () => {
    it('attaches Redux state to Sentry scope', () => {
      const enhancer = createReduxEnhancer();

      const initialState = {
        value: 'initial',
      };

      Redux.createStore((state = initialState) => state, enhancer);

      expect(mockGlobalScopeAddEventProcessor).toHaveBeenCalledTimes(1);

      const callbackFunction = mockGlobalScopeAddEventProcessor.mock.calls[0]?.[0];

      const mockEvent = {
        contexts: {
          state: {
            state: {
              type: 'redux',
              value: 'UPDATED_VALUE',
            },
          },
        },
      };

      const mockHint = {
        attachments: [],
      };

      const result = callbackFunction(mockEvent, mockHint);

      expect(result).toEqual({
        ...mockEvent,
        contexts: {
          state: {
            state: {
              type: 'redux',
              value: 'UPDATED_VALUE',
            },
          },
        },
      });

      expect(mockHint.attachments).toHaveLength(1);
      expect(mockHint.attachments[0]).toEqual({
        filename: 'redux_state.json',
        data: JSON.stringify('UPDATED_VALUE'),
      });
    });

    it('does not attach when attachReduxState is false', () => {
      const enhancer = createReduxEnhancer({ attachReduxState: false });

      const initialState = {
        value: 'initial',
      };

      Redux.createStore((state = initialState) => state, enhancer);

      expect(mockGlobalScopeAddEventProcessor).toHaveBeenCalledTimes(0);
    });

    it('does not attach when state.type is not redux', () => {
      const enhancer = createReduxEnhancer();

      const initialState = {
        value: 'initial',
      };

      Redux.createStore((state = initialState) => state, enhancer);

      expect(mockGlobalScopeAddEventProcessor).toHaveBeenCalledTimes(1);

      const callbackFunction = mockGlobalScopeAddEventProcessor.mock.calls[0]?.[0];

      const mockEvent = {
        contexts: {
          state: {
            state: {
              type: 'not_redux',
              value: 'UPDATED_VALUE',
            },
          },
        },
      };

      const mockHint = {
        attachments: [],
      };

      const result = callbackFunction(mockEvent, mockHint);

      expect(result).toEqual(mockEvent);

      expect(mockHint.attachments).toHaveLength(0);
    });

    it('does not attach when state is undefined', () => {
      const enhancer = createReduxEnhancer();

      const initialState = {
        value: 'initial',
      };

      Redux.createStore((state = initialState) => state, enhancer);

      expect(mockGlobalScopeAddEventProcessor).toHaveBeenCalledTimes(1);

      const callbackFunction = mockGlobalScopeAddEventProcessor.mock.calls[0]?.[0];

      const mockEvent = {
        contexts: {
          state: {
            state: undefined,
          },
        },
      };

      const mockHint = {
        attachments: [],
      };

      const result = callbackFunction(mockEvent, mockHint);

      expect(result).toEqual(mockEvent);

      expect(mockHint.attachments).toHaveLength(0);
    });

    it('does not attach when event type is not undefined', () => {
      const enhancer = createReduxEnhancer();

      const initialState = {
        value: 'initial',
      };

      Redux.createStore((state = initialState) => state, enhancer);

      expect(mockGlobalScopeAddEventProcessor).toHaveBeenCalledTimes(1);

      const callbackFunction = mockGlobalScopeAddEventProcessor.mock.calls[0]?.[0];

      const mockEvent = {
        type: 'not_redux',
        contexts: {
          state: {
            state: {
              type: 'redux',
              value: 'UPDATED_VALUE',
            },
          },
        },
      };

      const mockHint = {
        attachments: [],
      };

      const result = callbackFunction(mockEvent, mockHint);

      expect(result).toEqual(mockEvent);

      expect(mockHint.attachments).toHaveLength(0);
    });
  });

  it('restore itself when calling store replaceReducer', () => {
    const enhancer = createReduxEnhancer();

    const initialState = {};

    const ACTION_TYPE = 'UPDATE_VALUE';
    const reducer = (state: Record<string, unknown> = initialState, action: { type: string; newValue: any }) => {
      if (action.type === ACTION_TYPE) {
        return {
          ...state,
          value: action.newValue,
        };
      }
      return state;
    };

    const store = Redux.createStore(reducer, enhancer);

    store.replaceReducer(reducer);

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
});
