interface WithBuildTimeInstrumentation {
  buildTimeInstrumentation?: boolean;
  bundleSizeOptimizations?: { excludeChannelInjection?: boolean } & Record<string, unknown>;
}

/**
 * When build-time instrumentation (orchestrion diagnostics-channel injection) is enabled — which is
 * the default — the SDK's *runtime* channel injection is redundant. So we default
 * `bundleSizeOptimizations.excludeChannelInjection` to `true`, letting the bundler plugin tree-shake
 * the runtime hooks out of the build.
 *
 * The user can still opt back in by explicitly setting `excludeChannelInjection` (e.g. `false`), and
 * the default is not applied when build-time instrumentation is turned off
 * (`buildTimeInstrumentation: false`), since the runtime injection is then the only thing wiring up
 * the channels.
 */
export function withChannelInjectionExclusionDefault<T extends WithBuildTimeInstrumentation>(
  options?: T,
): T | undefined {
  if (options?.buildTimeInstrumentation === false) {
    return options;
  }

  return {
    ...(options as T),
    bundleSizeOptimizations: {
      excludeChannelInjection: true,
      // A user-provided value takes precedence over the default above.
      ...options?.bundleSizeOptimizations,
    },
  };
}
