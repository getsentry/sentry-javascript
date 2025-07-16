# Next.js SDK Build Performance Research

## Executive Summary

This document outlines research findings on improving build time performance for the Sentry Next.js SDK. The SDK currently has a complex build process involving TypeScript compilation, transpilation, bundling, and custom webpack loaders that can significantly impact build times.

## Current Build Architecture

### Build Steps

The Next.js SDK uses a multi-step build process:

1. **`build:transpile`** - Transpiles code using Rollup (`ts-node scripts/buildRollup.ts`)
2. **`build:types`** - Generates TypeScript type definitions
   - `build:types:core` - TypeScript compilation
   - `build:types:downlevel` - Downlevels types to TS 3.8
3. **`build:bundle`** - Creates CDN bundles (if applicable)
4. **`build:tarball`** - Generates npm package

These steps run in parallel using `run-p` (npm-run-all).

### Key Performance Bottlenecks

1. **Wrapping Loader Overhead**
   - Uses Rollup internally to wrap user code
   - Processes every page, API route, server component, and route handler
   - Each file goes through a full Rollup build process
   - Adds significant overhead to webpack compilation

2. **Multiple Build Outputs**
   - Generates both ESM and CJS builds
   - Creates separate template files
   - Builds multiple entry points

3. **TypeScript Compilation**
   - Compiles types separately from transpilation
   - Downlevels types for backwards compatibility
   - No incremental compilation by default

## Proven Performance Improvements

### 1. Nx Caching Implementation (35% CI Time Reduction)

The JavaScript SDK monorepo achieved significant improvements by implementing Nx caching:

**Results:**
- Min CI run time: ~20 min → ~13 min (35% reduction)
- Median CI run time: ~20 min → ~18 min (10% reduction)
- Min build time: ~8 min → ~1 min (87.5% reduction)
- Median build time: ~8 min → ~6 min (25% reduction)

**Implementation:**
- Cache `build:transpile`, `build:types`, and `build:bundle` tasks
- Define task dependencies and outputs in `nx.json`
- Use `namedInputs` to optimize cache invalidation
- Exclude test files and documentation from production inputs

### 2. Bundle Size Optimizations (29% Size Reduction)

Smaller bundles lead to faster builds:

**Techniques:**
- Remove optional chaining to avoid transpilation overhead
- Replace TypeScript enums with const enums or string constants
- Use try-catch blocks instead of nested object access checks
- Alias object keys to local variables for better minification
- Convert classes to functions where possible

### 3. Memory Optimization

For Out of Memory (OOM) errors during builds:

```bash
NODE_OPTIONS="--max-old-space-size=8192" next build
```

## Recommended Improvements

### 1. Implement Build Caching

**Add Nx configuration to cache build outputs:**

```json
{
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx/tasks-runners/default",
      "options": {
        "cacheableOperations": ["build:transpile", "build:types"],
        "cacheDirectory": ".nxcache"
      }
    }
  },
  "targetDefaults": {
    "build:transpile": {
      "inputs": ["production", "^production"],
      "outputs": ["{projectRoot}/build"]
    }
  }
}
```

### 2. Optimize Wrapping Loader

**Current issue:** Each file wrapped goes through a full Rollup compilation

**Potential improvements:**
- Implement caching for wrapped modules
- Use faster alternatives to Rollup (esbuild, swc)
- Batch process files instead of individual processing
- Skip wrapping in development mode for faster rebuilds

### 3. Parallelize Build Process

**Current:** Some steps run sequentially that could be parallel

**Improvements:**
- Use `concurrently` or `nx` for better parallelization
- Split type checking from transpilation
- Generate ESM and CJS in parallel

### 4. Incremental TypeScript Compilation

**Enable incremental compilation:**

```json
// tsconfig.json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

### 5. Conditional Builds

**Skip unnecessary steps based on environment:**

```javascript
// Only build types in CI or production
if (process.env.CI || process.env.NODE_ENV === 'production') {
  // Run type checking
}
```

### 6. Source Map Optimization

Source maps significantly impact build time:

```javascript
// Disable source maps for faster builds
module.exports = withSentryConfig(module.exports, {
  sourcemaps: {
    disable: true, // For maximum speed
    // OR
    hideSourceMaps: true, // Keep maps but don't expose
  }
});
```

### 7. Webpack Optimization

**Optimize webpack configuration:**

```javascript
{
  optimization: {
    minimize: false, // Disable in development
    moduleIds: 'deterministic',
    chunkIds: 'deterministic'
  },
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename]
    }
  }
}
```

### 8. Replace Heavy Dependencies

Consider lighter alternatives:
- Use `esbuild` or `swc` instead of Rollup for wrapping
- Use native Node.js features instead of polyfills
- Tree-shake unused code more aggressively

## Quick Wins

1. **Enable webpack filesystem cache:**
   ```javascript
   webpack: (config) => {
     config.cache = { type: 'filesystem' };
     return config;
   }
   ```

2. **Disable source maps in development:**
   ```javascript
   productionBrowserSourceMaps: false
   ```

3. **Increase Node.js memory:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096"
   ```

4. **Use SWC for transpilation** (Next.js built-in):
   ```javascript
   swcMinify: true
   ```

5. **Exclude large files from wrapping:**
   ```javascript
   excludeServerRoutes: [
     /api\/large-endpoint/,
     /pages\/heavy-page/
   ]
   ```

## Monitoring Build Performance

1. **Add build timing:**
   ```json
   {
     "scripts": {
       "build": "time yarn build:dev"
     }
   }
   ```

2. **Use webpack speed measure plugin:**
   ```javascript
   const SpeedMeasurePlugin = require("speed-measure-webpack-plugin");
   const smp = new SpeedMeasurePlugin();
   module.exports = smp.wrap(yourWebpackConfig);
   ```

3. **Enable webpack profiling:**
   ```javascript
   webpack: (config) => {
     config.profile = true;
     return config;
   }
   ```

## Long-term Architectural Improvements

1. **Lazy Loading:** Load Sentry SDK components on-demand
2. **Build Cache Server:** Shared cache for team builds
3. **Incremental Adoption:** Allow partial SDK usage
4. **Native Next.js Integration:** Work with Next.js team for deeper integration
5. **Modular Architecture:** Separate core from integrations

## Conclusion

The most impactful improvements come from:
1. Implementing build caching (Nx or similar)
2. Optimizing the wrapping loader
3. Parallelizing build steps
4. Reducing bundle size
5. Proper memory allocation

These changes can reduce build times by 35-50% based on the monorepo's experience with Nx caching and the bundle size optimizations achieved in v7.