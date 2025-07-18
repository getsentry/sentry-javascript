# Manual Page Load Span Control

## Overview

The `manualPageLoad` option allows you to take full control over when your page load spans finish, instead of relying on automatic timeout mechanisms.

## Configuration

```javascript
import { browserTracingIntegration } from '@sentry/browser';

Sentry.init({
  dsn: 'YOUR_DSN',
  integrations: [
    browserTracingIntegration({
      manualPageLoad: true, // Enable manual control
      // Other options...
    }),
  ],
});
```

## Usage

When `manualPageLoad: true` is set:

1. **Page load spans will NOT finish automatically** - all timeout mechanisms are disabled
2. **You MUST call `Sentry.reportPageLoaded()`** to finish the span manually
3. **The span will remain active** until you explicitly finish it

### Basic Usage

```javascript
// Your page load logic
async function initializePage() {
  // Load critical resources
  await loadCriticalData();
  
  // Initialize components
  await initializeComponents();
  
  // Page is fully loaded and ready
  Sentry.reportPageLoaded();
}

initializePage();
```

### With Custom Timestamp

```javascript
// Record the exact moment your page finished loading
const pageLoadFinishTime = Date.now();

// Later, when you're ready to send the span
Sentry.reportPageLoaded(undefined, pageLoadFinishTime);
```

### With Specific Client

```javascript
const client = Sentry.getClient();
Sentry.reportPageLoaded(client);
```

## When to Use This

This option is useful when:

- ✅ You have complex page initialization logic
- ✅ You need to wait for specific async operations to complete
- ✅ You want precise control over page load timing
- ✅ Your page load includes user interactions or dynamic content loading

## When NOT to Use This

Avoid this option when:

- ❌ You want automatic page load detection (default behavior is better)
- ❌ You might forget to call `reportPageLoaded()` (spans will never finish)
- ❌ You have simple, straightforward page loads

## Important Notes

⚠️ **Critical**: Always call `Sentry.reportPageLoaded()` when using this option. Forgetting to call it will result in spans that never finish, which can affect your performance metrics.

⚠️ **Timeout Disabled**: All automatic timeout mechanisms (`idleTimeout`, `finalTimeout`, `childSpanTimeout`) are completely disabled when this option is enabled.

## Migration from `disableIdleTimeouts`

If you were previously using `disableIdleTimeouts: true`:

```javascript
// Old way
browserTracingIntegration({
  disableIdleTimeouts: true, // ❌ Technical name
})

// New way
browserTracingIntegration({
  manualPageLoad: true, // ✅ Clear intent
})
```

The functionality remains exactly the same - only the name has changed to be more user-friendly.