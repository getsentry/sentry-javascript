import * as SentryReact from '@sentry/react';
import { render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorBoundaryProps, FallbackRender } from '../../src/client';
import {
  captureReactException,
  ErrorBoundary,
  Profiler,
  reactErrorHandler,
  useProfiler,
  withErrorBoundary,
  withProfiler,
} from '../../src/client';

describe('Re-exports from React SDK', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('re-export integrity', () => {
    it('should have the same reference as original @sentry/react exports', () => {
      // Ensure we are re-exporting the exact same functions/components, not copies
      expect(captureReactException).toBe(SentryReact.captureReactException);
      expect(reactErrorHandler).toBe(SentryReact.reactErrorHandler);
      expect(Profiler).toBe(SentryReact.Profiler);
      expect(withProfiler).toBe(SentryReact.withProfiler);
      expect(useProfiler).toBe(SentryReact.useProfiler);
      expect(ErrorBoundary).toBe(SentryReact.ErrorBoundary);
      expect(withErrorBoundary).toBe(SentryReact.withErrorBoundary);
    });
  });

  describe('function exports', () => {
    it('captureReactException should work when called', () => {
      const error = new Error('test error');
      const errorInfo = { componentStack: 'component stack' };

      const result = captureReactException(error, errorInfo);
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[a-f0-9]{32}$/); // assuming event ID is a 32-character hex string
    });
  });

  describe('component exports', () => {
    it('ErrorBoundary should render children when no error occurs', () => {
      const { getByText } = render(
        React.createElement(
          ErrorBoundary,
          { fallback: () => React.createElement('div', null, 'Error occurred') },
          React.createElement('div', null, 'Child content'),
        ),
      );

      expect(getByText('Child content')).toBeDefined();
    });

    it('Profiler should render children', () => {
      const { getByText } = render(
        React.createElement(
          Profiler,
          { name: 'TestProfiler', updateProps: {} },
          React.createElement('div', null, 'Profiled content'),
        ),
      );

      expect(getByText('Profiled content')).toBeDefined();
    });
  });

  describe('HOC exports', () => {
    it('withErrorBoundary should create a wrapped component', () => {
      const TestComponent = () => React.createElement('div', null, 'ErrorBoundary Test Component');
      const WrappedComponent = withErrorBoundary(TestComponent, {
        fallback: () => React.createElement('div', null, 'Error occurred'),
      });

      expect(WrappedComponent).toBeDefined();
      expect(typeof WrappedComponent).toBe('object');
      expect(WrappedComponent.displayName).toBe('errorBoundary(TestComponent)');

      const { getByText } = render(React.createElement(WrappedComponent));
      expect(getByText('ErrorBoundary Test Component')).toBeDefined();
    });

    it('withProfiler should create a wrapped component', () => {
      const TestComponent = () => React.createElement('div', null, 'Profiler Test Component');
      const WrappedComponent = withProfiler(TestComponent, { name: 'TestComponent' });

      expect(WrappedComponent).toBeDefined();
      expect(typeof WrappedComponent).toBe('function');
      expect(WrappedComponent.displayName).toBe('profiler(TestComponent)');

      const { getByText } = render(React.createElement(WrappedComponent));
      expect(getByText('Profiler Test Component')).toBeDefined();
    });
  });

  describe('type exports', () => {
    it('should export ErrorBoundaryProps type', () => {
      // This is a compile-time test - if this compiles, the type is exported correctly
      const props: ErrorBoundaryProps = {
        children: React.createElement('div'),
        fallback: () => React.createElement('div', null, 'Error'),
      };
      expect(props).toBeDefined();
    });

    it('should export FallbackRender type', () => {
      // This is a compile-time test - if this compiles, the type is exported correctly
      const fallbackRender: FallbackRender = ({ error }) =>
        React.createElement('div', null, `Error: ${error?.toString()}`);
      expect(fallbackRender).toBeDefined();
      expect(typeof fallbackRender).toBe('function');
    });
  });
});
