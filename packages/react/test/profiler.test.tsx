import { SentrySpan } from '@sentry/core';
import type { SpanContext } from '@sentry/types';
import { render } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
// biome-ignore lint/nursery/noUnusedImports: Need React import for JSX
import * as React from 'react';

import { REACT_MOUNT_OP, REACT_RENDER_OP, REACT_UPDATE_OP } from '../src/constants';
import { UNKNOWN_COMPONENT, useProfiler, withProfiler } from '../src/profiler';

const mockStartInactiveSpan = jest.fn((spanArgs: SpanContext) => ({ ...spanArgs }));
const mockFinish = jest.fn();

class MockSpan extends SentrySpan {
  public end(): void {
    mockFinish();
  }
}

let activeSpan: Record<string, any>;

jest.mock('@sentry/browser', () => ({
  ...jest.requireActual('@sentry/browser'),
  getActiveSpan: () => activeSpan,
  startInactiveSpan: (ctx: SpanContext) => {
    mockStartInactiveSpan(ctx);
    return new MockSpan(ctx);
  },
}));

beforeEach(() => {
  mockStartInactiveSpan.mockClear();
  mockFinish.mockClear();
  activeSpan = new MockSpan({ op: 'pageload' });
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
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(0);
      render(<ProfiledComponent />);
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(0);
    });

    it('is created when a component is mounted', () => {
      const ProfiledComponent = withProfiler(() => <h1>Testing</h1>);

      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(0);

      render(<ProfiledComponent />);

      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
      expect(mockStartInactiveSpan).toHaveBeenLastCalledWith({
        name: `<${UNKNOWN_COMPONENT}>`,
        onlyIfParent: true,
        op: REACT_MOUNT_OP,
        attributes: {
          'sentry.origin': 'auto.ui.react.profiler',
          'ui.component_name': 'unknown',
        },
      });
    });
  });

  describe('render span', () => {
    it('is created on unmount', () => {
      const ProfiledComponent = withProfiler(() => <h1>Testing</h1>);
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(0);

      const component = render(<ProfiledComponent />);
      component.unmount();

      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(2);
      expect(mockStartInactiveSpan).toHaveBeenLastCalledWith({
        name: `<${UNKNOWN_COMPONENT}>`,
        onlyIfParent: true,
        op: REACT_RENDER_OP,
        startTime: undefined,
        attributes: {
          'sentry.origin': 'auto.ui.react.profiler',
          'ui.component_name': 'unknown',
        },
      });
      expect(mockFinish).toHaveBeenCalledTimes(2);
    });

    it('is not created if hasRenderSpan is false', () => {
      const ProfiledComponent = withProfiler(() => <h1>Testing</h1>, {
        includeRender: false,
      });
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(0);

      const component = render(<ProfiledComponent />);
      component.unmount();

      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
    });
  });
  describe('update span', () => {
    it('is created when component is updated', () => {
      const ProfiledComponent = withProfiler((props: { num: number }) => <div>{props.num}</div>);
      const { rerender } = render(<ProfiledComponent num={0} />);
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
      expect(mockFinish).toHaveBeenCalledTimes(1);

      // Dispatch new props
      rerender(<ProfiledComponent num={1} />);
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(2);
      expect(mockStartInactiveSpan).toHaveBeenLastCalledWith({
        attributes: {
          'sentry.origin': 'auto.ui.react.profiler',
          'ui.react.changed_props': ['num'],
          'ui.component_name': 'unknown',
        },
        name: `<${UNKNOWN_COMPONENT}>`,
        onlyIfParent: true,
        op: REACT_UPDATE_OP,
        startTime: expect.any(Number),
      });
      expect(mockFinish).toHaveBeenCalledTimes(2);
      // New props yet again
      rerender(<ProfiledComponent num={2} />);
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(3);
      expect(mockStartInactiveSpan).toHaveBeenLastCalledWith({
        attributes: {
          'sentry.origin': 'auto.ui.react.profiler',
          'ui.react.changed_props': ['num'],
          'ui.component_name': 'unknown',
        },
        name: `<${UNKNOWN_COMPONENT}>`,
        onlyIfParent: true,
        op: REACT_UPDATE_OP,
        startTime: expect.any(Number),
      });
      expect(mockFinish).toHaveBeenCalledTimes(3);

      // Should not create spans if props haven't changed
      rerender(<ProfiledComponent num={2} />);
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(3);
      expect(mockFinish).toHaveBeenCalledTimes(3);
    });

    it('does not get created if hasUpdateSpan is false', () => {
      const ProfiledComponent = withProfiler((props: { num: number }) => <div>{props.num}</div>, {
        includeUpdates: false,
      });
      const { rerender } = render(<ProfiledComponent num={0} />);
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);

      // Dispatch new props
      rerender(<ProfiledComponent num={1} />);
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useProfiler()', () => {
  describe('mount span', () => {
    it('does not get created if Profiler is disabled', () => {
      renderHook(() => useProfiler('Example', { disabled: true }));
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(0);
    });

    it('is created when a component is mounted', () => {
      renderHook(() => useProfiler('Example'));

      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
      expect(mockStartInactiveSpan).toHaveBeenLastCalledWith({
        name: '<Example>',
        onlyIfParent: true,
        op: REACT_MOUNT_OP,
        attributes: {
          'ui.component_name': 'Example',
          'sentry.origin': 'auto.ui.react.profiler',
        },
      });
    });
  });

  describe('render span', () => {
    it('does not get created when hasRenderSpan is false', () => {
      const component = renderHook(() => useProfiler('Example', { hasRenderSpan: false }));
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
      component.unmount();
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
    });

    it('is created by default', () => {
      const component = renderHook(() => useProfiler('Example'));

      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
      component.unmount();
      expect(mockStartInactiveSpan).toHaveBeenCalledTimes(2);
      expect(mockStartInactiveSpan).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: '<Example>',
          onlyIfParent: true,
          op: REACT_RENDER_OP,
          attributes: {
            'sentry.origin': 'auto.ui.react.profiler',
            'ui.component_name': 'Example',
          },
        }),
      );
    });
  });
});
