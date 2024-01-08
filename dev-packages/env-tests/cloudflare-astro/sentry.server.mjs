import * as Sentry from '@sentry/astro'
import { ProfilingIntegration } from '@sentry/profiling-node'

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  integrations: [new ProfilingIntegration()],
})
