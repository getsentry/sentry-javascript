# Continuous Profiling API Changes

The continuous profiling API has been redesigned to give developers more explicit control over profiling sessions while maintaining ease of use. This guide outlines the key changes.

## New Profiling Modes

### profileLifecycle Option

We've introduced a new `profileLifecycle` option that allows you to explicitly set how profiling sessions are managed:

- `manual` (default) - You control profiling sessions using the API methods
- `trace` - Profiling sessions are automatically tied to traces

Previously, the profiling mode was implicitly determined by initialization options. Now you can clearly specify your intended behavior.

## New Sampling Controls

### profileSessionSampleRate

We've introduced `profileSessionSampleRate` to control what percentage of SDK instances will collect profiles. This is evaluated once during SDK initialization. This is particularly useful for:

- Controlling profiling costs across distributed services
- Managing profiling in serverless environments where you may only want to profile a subset of instances

### Deprecations

The `profilesSampleRate` option has been deprecated in favor of the new sampling controls.
The `profilesSampler` option hsa been deprecated in favor of manual profiler control.
