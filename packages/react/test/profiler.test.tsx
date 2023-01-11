import type { SpanContext } from '@sentry/types';
import { render } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import * as React from 'react';

import { REACT_MOUNT_OP, REACT_RENDER_OP, REACT_UPDATE_OP } from '../src/constants';
import { UNKNOWN_COMPONENT, useProfiler, withProfiler } from '../src/profiler';

const mockStartChild = jest.fn((spanArgs: SpanContext) => ({ ...spanArgs }));
const mockFinish = jest.fn();

// @sent
class MockSpan {
  public constructor(public readonly ctx: SpanContext) {}

  public startChild(ctx: SpanContext): MockSpan {
    mockStartChild(ctx);
    return new MockSpan(ctx);
  }

  public finish(): void {
    mockFinish();
  }
}

let activeTransaction: Record<string, any>;

jest.mock('@sentry/browser', () => ({
  getCurrentHub: () => ({
    getIntegration: () => undefined,
    getScope: () => ({
      getTransaction: () => activeTransaction,
    }),
  }),
}));

beforeEach(() => {
  mockStartChild.mockClear();
  mockFinish.mockClear();
  activeTransaction = new MockSpan({ op: 'pageload' });
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
      expect(mockStartChild).toHaveBeenCalledTimes(0);
      render(<ProfiledComponent />);
      expect(mockStartChild).toHaveBeenCalledTimes(0);
    });

    it('is created when a component is mounted', () => {
      const ProfiledComponent = withProfiler(() => <h1>Testing</h1>);

      expect(mockStartChild).toHaveBeenCalledTimes(0);

      render(<ProfiledComponent />);

      expect(mockStartChild).toHaveBeenCalledTimes(1);
      expect(mockStartChild).toHaveBeenLastCalledWith({
        description: `<${UNKNOWN_COMPONENT}>`,
        op: REACT_MOUNT_OP,
      });
    });
  });

  describe('render span', () => {
    it('is created on unmount', () => {
      const ProfiledComponent = withProfiler(() => <h1>Testing</h1>);
      expect(mockStartChild).toHaveBeenCalledTimes(0);

      const component = render(<ProfiledComponent />);
      component.unmount();

      expect(mockStartChild).toHaveBeenCalledTimes(2);
      expect(mockStartChild).toHaveBeenLastCalledWith({
        description: `<${UNKNOWN_COMPONENT}>`,
        endTimestamp: expect.any(Number),
        op: REACT_RENDER_OP,
        startTimestamp: undefined,
      });
    });

    it('is not created if hasRenderSpan is false', () => {
      const ProfiledComponent = withProfiler(() => <h1>Testing</h1>, {
        includeRender: false,
      });
      expect(mockStartChild).toHaveBeenCalledTimes(0);

      const component = render(<ProfiledComponent />);
      component.unmount();

      expect(mockStartChild).toHaveBeenCalledTimes(1);
    });
  });

  describe('update span', () => {
    it('is created when component is updated', () => {
      const ProfiledComponent = withProfiler((props: { num: number }) => <div>{props.num}</div>);
      const { rerender } = render(<ProfiledComponent num={0} />);
      expect(mockStartChild).toHaveBeenCalledTimes(1);
      expect(mockFinish).toHaveBeenCalledTimes(1);

      // Dispatch new props
      rerender(<ProfiledComponent num={1} />);
      expect(mockStartChild).toHaveBeenCalledTimes(2);
      expect(mockStartChild).toHaveBeenLastCalledWith({
        data: { changedProps: ['num'] },
        description: `<${UNKNOWN_COMPONENT}>`,
        op: REACT_UPDATE_OP,
        startTimestamp: expect.any(Number),
      });
      expect(mockFinish).toHaveBeenCalledTimes(2);
      // New props yet again
      rerender(<ProfiledComponent num={2} />);
      expect(mockStartChild).toHaveBeenCalledTimes(3);
      expect(mockStartChild).toHaveBeenLastCalledWith({
        data: { changedProps: ['num'] },
        description: `<${UNKNOWN_COMPONENT}>`,
        op: REACT_UPDATE_OP,
        startTimestamp: expect.any(Number),
      });
      expect(mockFinish).toHaveBeenCalledTimes(3);

      // Should not create spans if props haven't changed
      rerender(<ProfiledComponent num={2} />);
      expect(mockStartChild).toHaveBeenCalledTimes(3);
      expect(mockFinish).toHaveBeenCalledTimes(3);
    });

    it('does not get created if hasUpdateSpan is false', () => {
      const ProfiledComponent = withProfiler((props: { num: number }) => <div>{props.num}</div>, {
        includeUpdates: false,
      });
      const { rerender } = render(<ProfiledComponent num={0} />);
      expect(mockStartChild).toHaveBeenCalledTimes(1);

      // Dispatch new props
      rerender(<ProfiledComponent num={1} />);
      expect(mockStartChild).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useProfiler()', () => {
  describe('mount span', () => {
    it('does not get created if Profiler is disabled', () => {
      renderHook(() => useProfiler('Example', { disabled: true }));
      expect(mockStartChild).toHaveBeenCalledTimes(0);
    });

    it('is created when a component is mounted', () => {
      renderHook(() => useProfiler('Example'));

      expect(mockStartChild).toHaveBeenCalledTimes(1);
      expect(mockStartChild).toHaveBeenLastCalledWith({
        description: '<Example>',
        op: REACT_MOUNT_OP,
      });
    });
  });

  describe('render span', () => {
    it('does not get created when hasRenderSpan is false', () => {
      const component = renderHook(() => useProfiler('Example', { hasRenderSpan: false }));
      expect(mockStartChild).toHaveBeenCalledTimes(1);
      component.unmount();
      expect(mockStartChild).toHaveBeenCalledTimes(1);
    });

    it('is created by default', () => {
      const component = renderHook(() => useProfiler('Example'));

      expect(mockStartChild).toHaveBeenCalledTimes(1);
      component.unmount();
      expect(mockStartChild).toHaveBeenCalledTimes(2);
      expect(mockStartChild).toHaveBeenLastCalledWith(
        expect.objectContaining({
          description: '<Example>',
          op: REACT_RENDER_OP,
        }),
      );
    });
  });
});
