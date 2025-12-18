# Vue TanStack Router E2E Test App

E2E test application for `@sentry/vue` with TanStack Router integration.

## Getting Started

To run this application:

```bash
pnpm install
pnpm dev
```

## Building For Production

To build this application for production:

```bash
pnpm build
```

## Running Tests

To run E2E tests:

```bash
pnpm test:build  # Install deps and build
pnpm test:assert # Run Playwright tests
```

## Routing

This project uses [TanStack Router](https://tanstack.com/router) for Vue.js. The router is set up with code-based routing in the `./src/main.ts` file.

### Routes

- `/` - Home page with navigation links
- `/posts/$postId` - Post detail page with parameterized route

### Sentry Integration

The app demonstrates:

- TanStack Router browser tracing integration
- Pageload transaction tracking with parameterized routes
- Navigation transaction tracking
- Route parameter extraction and span attribution

## Testing

The E2E tests verify:

1. Pageload transactions are created with correct route parameters
2. Navigation transactions are properly instrumented
3. Route parameters are captured in transaction data
4. Sentry origins are correctly set for Vue TanStack Router

## Learn More

- [TanStack Router Documentation](https://tanstack.com/router)
- [Sentry Vue SDK](https://docs.sentry.io/platforms/javascript/guides/vue/)
