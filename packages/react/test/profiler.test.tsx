import { render } from '@testing-library/react';
import * as React from 'react';

import { UNKNOWN_COMPONENT, withProfiler } from '../src/profiler';

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
  it('sets displayName properly', () => {
    const TestComponent = () => <h1>Hello World</h1>;

    const ProfiledComponent = withProfiler(TestComponent);
    expect(ProfiledComponent.displayName).toBe('profiler(TestComponent)');
  });

  describe('Tracing Integration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockPushActivity.mockClear();
      mockPopActivity.mockClear();
    });

    it('is called with popActivity() when unmounted', () => {
      const ProfiledComponent = withProfiler(() => <h1>Hello World</h1>);

      expect(mockPopActivity).toHaveBeenCalledTimes(0);

      const profiler = render(<ProfiledComponent />);
      profiler.unmount();

      jest.runAllTimers();

      expect(mockPopActivity).toHaveBeenCalledTimes(1);
      expect(mockPopActivity).toHaveBeenLastCalledWith(1);
    });

    describe('pushActivity()', () => {
      it('is called when mounted', () => {
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
  });
});
