import * as React from 'react';
import { create, ReactTestInstance } from 'react-test-renderer';

import { withProfiler } from '../src/profiler';

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
      mockPushActivity.mockClear();
      mockPopActivity.mockClear();
    });

    it('is called with pushActivity() when mounted', () => {
      const ProfiledComponent = withProfiler(() => <h1>Hello World</h1>);

      expect(mockPushActivity).toHaveBeenCalledTimes(0);
      create(<ProfiledComponent />);
      expect(mockPushActivity).toHaveBeenCalledTimes(1);
    });

    it('is called with popActivity() when unmounted', () => {
      const ProfiledComponent = withProfiler(() => <h1>Hello World</h1>);

      expect(mockPopActivity).toHaveBeenCalledTimes(0);

      const profiler = create(<ProfiledComponent />);
      profiler.unmount();

      expect(mockPopActivity).toHaveBeenCalledTimes(1);
    });

    it('calls finishProfile() when unmounting', () => {
      const ProfiledComponent = withProfiler(() => <h1>Hello World</h1>);

      const mockFinishProfile = jest.fn();
      const profiler = create(<ProfiledComponent />);

      const instance = profiler.getInstance() as ReactTestInstance & { finishProfile(): void };
      instance.finishProfile = mockFinishProfile;

      expect(mockFinishProfile).toHaveBeenCalledTimes(0);
      profiler.unmount();
      expect(mockFinishProfile).toHaveBeenCalledTimes(1);
    });
  });
});
