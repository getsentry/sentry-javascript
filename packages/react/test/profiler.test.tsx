import { render } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import * as React from 'react';

import { UNKNOWN_COMPONENT, useProfiler, withProfiler } from '../src/profiler';

const mockPushActivity = jest.fn().mockReturnValue(1);
const mockPopActivity = jest.fn();
const mockLoggerWarn = jest.fn();

let integrationIsNull = false;

jest.mock('@sentry/utils', () => ({
  logger: {
    warn: (message: string) => {
      mockLoggerWarn(message);
    },
  },
}));

jest.mock('@sentry/browser', () => ({
  getCurrentHub: () => ({
    getIntegration: (_: string) => {
      class MockIntegration {
        public constructor(name: string) {
          this.name = name;
        }
        public name: string;
        public setupOnce: () => void = jest.fn();
        public static pushActivity: () => void = mockPushActivity;
        public static popActivity: () => void = mockPopActivity;
      }

      if (!integrationIsNull) {
        return new MockIntegration('test');
      }

      return null;
    },
  }),
}));

describe('withProfiler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPushActivity.mockClear();
    mockPopActivity.mockClear();
    mockLoggerWarn.mockClear();
    integrationIsNull = false;
  });

  it('sets displayName properly', () => {
    const TestComponent = () => <h1>Hello World</h1>;

    const ProfiledComponent = withProfiler(TestComponent);
    expect(ProfiledComponent.displayName).toBe('profiler(TestComponent)');
  });

  it('sets a custom displayName', () => {
    const TestComponent = () => <h1>Hello World</h1>;

    const ProfiledComponent = withProfiler(TestComponent, 'BestComponent');
    expect(ProfiledComponent.displayName).toBe('profiler(BestComponent)');
  });

  it('defaults to an unknown displayName', () => {
    const ProfiledComponent = withProfiler(() => <h1>Hello World</h1>);
    expect(ProfiledComponent.displayName).toBe(`profiler(${UNKNOWN_COMPONENT})`);
  });

  it('popActivity() is called when unmounted', () => {
    const ProfiledComponent = withProfiler(() => <h1>Hello World</h1>);

    expect(mockPopActivity).toHaveBeenCalledTimes(0);
    const profiler = render(<ProfiledComponent />);
    profiler.unmount();

    jest.runAllTimers();

    expect(mockPopActivity).toHaveBeenCalledTimes(1);
    expect(mockPopActivity).toHaveBeenLastCalledWith(1);
  });

  it('pushActivity() is called when mounted', () => {
    const ProfiledComponent = withProfiler(() => <h1>Testing</h1>);

    expect(mockPushActivity).toHaveBeenCalledTimes(0);
    render(<ProfiledComponent />);
    expect(mockPushActivity).toHaveBeenCalledTimes(1);
    expect(mockPushActivity).toHaveBeenLastCalledWith(UNKNOWN_COMPONENT, {
      description: `<${UNKNOWN_COMPONENT}>`,
      op: 'react',
    });
  });

  it('does not start an activity when integration is disabled', () => {
    integrationIsNull = true;
    const ProfiledComponent = withProfiler(() => <h1>Hello World</h1>);

    expect(mockPushActivity).toHaveBeenCalledTimes(0);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(0);

    const profiler = render(<ProfiledComponent />);
    expect(mockPopActivity).toHaveBeenCalledTimes(0);
    expect(mockPushActivity).toHaveBeenCalledTimes(0);

    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);

    profiler.unmount();
    expect(mockPopActivity).toHaveBeenCalledTimes(0);
  });
});

describe('useProfiler()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPushActivity.mockClear();
    mockPopActivity.mockClear();
    mockLoggerWarn.mockClear();
    integrationIsNull = false;
  });

  it('popActivity() is called when unmounted', () => {
    // tslint:disable-next-line: no-void-expression
    const profiler = renderHook(() => useProfiler('Example'));
    expect(mockPopActivity).toHaveBeenCalledTimes(0);
    profiler.unmount();

    jest.runAllTimers();

    expect(mockPopActivity).toHaveBeenCalled();
    expect(mockPopActivity).toHaveBeenLastCalledWith(1);
  });

  it('pushActivity() is called when mounted', () => {
    expect(mockPushActivity).toHaveBeenCalledTimes(0);
    // tslint:disable-next-line: no-void-expression
    const profiler = renderHook(() => useProfiler('Example'));
    profiler.unmount();
    expect(mockPushActivity).toHaveBeenCalledTimes(1);
    expect(mockPushActivity).toHaveBeenLastCalledWith('Example', {
      description: `<Example>`,
      op: 'react',
    });
  });

  it('does not start an activity when integration is disabled', () => {
    integrationIsNull = true;
    expect(mockPushActivity).toHaveBeenCalledTimes(0);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(0);

    // tslint:disable-next-line: no-void-expression
    const profiler = renderHook(() => useProfiler('Example'));
    expect(mockPopActivity).toHaveBeenCalledTimes(0);
    expect(mockPushActivity).toHaveBeenCalledTimes(0);

    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);

    profiler.unmount();
    expect(mockPopActivity).toHaveBeenCalledTimes(0);
  });
});
