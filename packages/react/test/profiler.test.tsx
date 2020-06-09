import { render } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import * as React from 'react';

import { UNKNOWN_COMPONENT, useProfiler, withProfiler } from '../src/profiler';

const mockPushActivity = jest.fn().mockReturnValue(1);
const mockPopActivity = jest.fn();

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

      return new MockIntegration('test');
    },
  }),
}));

describe('withProfiler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPushActivity.mockClear();
    mockPopActivity.mockClear();
  });

  it('sets displayName properly', () => {
    const TestComponent = () => <h1>Hello World</h1>;

    const ProfiledComponent = withProfiler(TestComponent);
    expect(ProfiledComponent.displayName).toBe('profiler(TestComponent)');
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
});

describe('useProfiler()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPushActivity.mockClear();
    mockPopActivity.mockClear();
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
});
