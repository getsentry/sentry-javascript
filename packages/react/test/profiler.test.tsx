import { SpanContext } from '@sentry/types';
import { render } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import * as React from 'react';

import { UNKNOWN_COMPONENT, useProfiler, withProfiler } from '../src/profiler';
/*(
for key in SENTRY_FEATURES:
	SENTRY_FEATURES[key] = True

SENTRY_APM_SAMPLING = 1
)*/
const TEST_SPAN_ID = '518999beeceb49af';

const mockSpanFinish = jest.fn();
const mockStartChild = jest.fn((spanArgs: SpanContext) => ({ ...spanArgs, finish: mockSpanFinish }));
const TEST_SPAN = {
  spanId: TEST_SPAN_ID,
  startChild: mockStartChild,
};
const TEST_TIMESTAMP = '123456';
const mockPushActivity = jest.fn().mockReturnValue(1);
const mockPopActivity = jest.fn();
const mockLoggerWarn = jest.fn();
const mockGetActivitySpan = jest.fn().mockReturnValue(TEST_SPAN);

jest.mock('@sentry/utils', () => ({
  logger: {
    warn: (message: string) => {
      mockLoggerWarn(message);
    },
  },
  timestampWithMs: () => TEST_TIMESTAMP,
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
        public static getActivitySpan: () => void = mockGetActivitySpan;
      }
      return new MockIntegration('test');
    },
  }),
}));

beforeEach(() => {
  mockPushActivity.mockClear();
  mockPopActivity.mockClear();
  mockLoggerWarn.mockClear();
  mockGetActivitySpan.mockClear();
  mockStartChild.mockClear();
  mockSpanFinish.mockClear();
});

describe('withProfiler', () => {
  it('sets displayName properly', () => {
    const TestComponent = () => <h1>Hello World</h1>;

    const ProfiledComponent = withProfiler(TestComponent);
    expect(ProfiledComponent.displayName).toBe('profiler(TestComponent)');
  });

  it('sets a custom displayName', () => {
    const TestComponent = () => <h1>Hello World</h1>;

    const ProfiledComponent = withProfiler(TestComponent, { name: 'BestComponent' });
    expect(ProfiledComponent.displayName).toBe('profiler(BestComponent)');
  });

  it('defaults to an unknown displayName', () => {
    const ProfiledComponent = withProfiler(() => <h1>Hello World</h1>);
    expect(ProfiledComponent.displayName).toBe(`profiler(${UNKNOWN_COMPONENT})`);
  });

  describe('mount span', () => {
    it('does not get created if Profiler is disabled', () => {
      const ProfiledComponent = withProfiler(() => <h1>Testing</h1>, { disabled: true });
      expect(mockPushActivity).toHaveBeenCalledTimes(0);
      render(<ProfiledComponent />);
      expect(mockPushActivity).toHaveBeenCalledTimes(0);
    });

    it('is created when a component is mounted', () => {
      const ProfiledComponent = withProfiler(() => <h1>Testing</h1>);

      expect(mockPushActivity).toHaveBeenCalledTimes(0);
      expect(mockGetActivitySpan).toHaveBeenCalledTimes(0);
      expect(mockPopActivity).toHaveBeenCalledTimes(0);

      render(<ProfiledComponent />);

      expect(mockPushActivity).toHaveBeenCalledTimes(1);
      expect(mockPushActivity).toHaveBeenLastCalledWith(
        UNKNOWN_COMPONENT,
        {
          description: `<${UNKNOWN_COMPONENT}>`,
          op: 'react.mount',
        },
        undefined,
      );
      expect(mockGetActivitySpan).toHaveBeenCalledTimes(1);
      expect(mockGetActivitySpan).toHaveBeenLastCalledWith(1);

      expect(mockPopActivity).toHaveBeenCalledTimes(1);
      expect(mockPopActivity).toHaveBeenLastCalledWith(1);
    });
  });

  describe('render span', () => {
    it('does not get created by default', () => {
      const ProfiledComponent = withProfiler(() => <h1>Testing</h1>);
      expect(mockStartChild).toHaveBeenCalledTimes(0);
      render(<ProfiledComponent />);
      expect(mockStartChild).toHaveBeenCalledTimes(0);
    });

    it('is created when given hasRenderSpan option', () => {
      const ProfiledComponent = withProfiler(() => <h1>Testing</h1>, { hasRenderSpan: true });
      expect(mockStartChild).toHaveBeenCalledTimes(0);
      const component = render(<ProfiledComponent />);
      expect(mockStartChild).toHaveBeenCalledTimes(1);
      expect(mockStartChild).toHaveBeenLastCalledWith({
        description: `<${UNKNOWN_COMPONENT}>`,
        op: 'react.render',
      });

      expect(mockSpanFinish).toHaveBeenCalledTimes(0);
      component.unmount();
      expect(mockSpanFinish).toHaveBeenCalledTimes(1);
    });
  });

  describe('update span', () => {
    it('is created when component is updated', () => {
      const ProfiledComponent = withProfiler((props: { num: number }) => <div>{props.num}</div>);
      const { rerender } = render(<ProfiledComponent num={0} />);
      expect(mockStartChild).toHaveBeenCalledTimes(0);

      // Dispatch new props
      rerender(<ProfiledComponent num={1} />);
      expect(mockStartChild).toHaveBeenCalledTimes(1);
      expect(mockStartChild).toHaveBeenLastCalledWith({
        data: { changedProps: ['num'] },
        description: `<${UNKNOWN_COMPONENT}>`,
        endTimestamp: TEST_TIMESTAMP,
        op: 'react.update',
        startTimestamp: TEST_TIMESTAMP,
      });

      // New props yet again
      rerender(<ProfiledComponent num={2} />);
      expect(mockStartChild).toHaveBeenCalledTimes(2);
      expect(mockStartChild).toHaveBeenLastCalledWith({
        data: { changedProps: ['num'] },
        description: `<${UNKNOWN_COMPONENT}>`,
        endTimestamp: TEST_TIMESTAMP,
        op: 'react.update',
        startTimestamp: TEST_TIMESTAMP,
      });

      // Should not create spans if props haven't changed
      rerender(<ProfiledComponent num={2} />);
      expect(mockStartChild).toHaveBeenCalledTimes(2);
    });

    it('does not get created if hasUpdateSpan is false', () => {
      const ProfiledComponent = withProfiler((props: { num: number }) => <div>{props.num}</div>, {
        hasUpdateSpan: false,
      });
      const { rerender } = render(<ProfiledComponent num={0} />);
      expect(mockStartChild).toHaveBeenCalledTimes(0);

      // Dispatch new props
      rerender(<ProfiledComponent num={1} />);
      expect(mockStartChild).toHaveBeenCalledTimes(0);
    });
  });
});

describe('useProfiler()', () => {
  describe('mount span', () => {
    it('does not get created if Profiler is disabled', () => {
      // tslint:disable-next-line: no-void-expression
      renderHook(() => useProfiler('Example', { disabled: true }));
      expect(mockPushActivity).toHaveBeenCalledTimes(0);
    });

    it('is created when a component is mounted', () => {
      // tslint:disable-next-line: no-void-expression
      renderHook(() => useProfiler('Example'));

      expect(mockPushActivity).toHaveBeenCalledTimes(1);
      expect(mockPushActivity).toHaveBeenLastCalledWith(
        'Example',
        {
          description: '<Example>',
          op: 'react.mount',
        },
        undefined,
      );
      expect(mockGetActivitySpan).toHaveBeenCalledTimes(1);
      expect(mockGetActivitySpan).toHaveBeenLastCalledWith(1);

      expect(mockPopActivity).toHaveBeenCalledTimes(1);
      expect(mockPopActivity).toHaveBeenLastCalledWith(1);
    });
  });

  describe('render span', () => {
    it('does not get created by default', () => {
      // tslint:disable-next-line: no-void-expression
      renderHook(() => useProfiler('Example'));
      expect(mockStartChild).toHaveBeenCalledTimes(0);
    });

    it('is created when given hasRenderSpan option', () => {
      // tslint:disable-next-line: no-void-expression
      const component = renderHook(() => useProfiler('Example', { hasRenderSpan: true }));

      expect(mockStartChild).toHaveBeenCalledTimes(1);
      expect(mockStartChild).toHaveBeenLastCalledWith({
        description: '<Example>',
        op: 'react.render',
      });

      expect(mockSpanFinish).toHaveBeenCalledTimes(0);
      component.unmount();
      expect(mockSpanFinish).toHaveBeenCalledTimes(1);
    });
  });
});
