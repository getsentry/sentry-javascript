import { Scope } from '@sentry/hub';
import { render } from '@testing-library/svelte';

import DummyComponent from './components/Dummy.svelte';

let testTransaction = {
  startChild: jest.fn(),
  finish: jest.fn(),
};
let testUpdateSpan = { finish: jest.fn() };
let testInitSpan = { finish: jest.fn(), startChild: jest.fn(), transaction: testTransaction };

jest.mock('@sentry/hub', () => {
  const original = jest.requireActual('@sentry/hub');
  return {
    ...original,
    getCurrentHub(): {
      getScope(): Scope;
    } {
      return {
        getScope(): any {
          return {
            getTransaction: () => {
              return testTransaction;
            },
          };
        },
      };
    },
  };
});

describe('Sentry.trackComponent()', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    testTransaction.startChild.mockReturnValue(testInitSpan);
    testInitSpan.startChild.mockReturnValue(testUpdateSpan);
  });
  it('creates nested init and update spans on component initialization', () => {
    render(DummyComponent, { props: { options: {} } });

    expect(testTransaction.startChild).toHaveBeenCalledWith({
      description: '<Dummy>',
      op: 'ui.svelte.init',
    });

    expect(testInitSpan.startChild as jest.Mock).toHaveBeenCalledWith({
      description: '<Dummy>',
      op: 'ui.svelte.update',
    });

    expect(testInitSpan.finish).toHaveBeenCalledTimes(1);
    expect(testUpdateSpan.finish).toHaveBeenCalledTimes(1);
  });
});
