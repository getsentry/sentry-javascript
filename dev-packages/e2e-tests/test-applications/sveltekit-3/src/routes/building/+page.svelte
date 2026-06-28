<script lang="ts">
  import * as Sentry from '@sentry/sveltekit';

  async function getSentryData() {
    Sentry.startSpan({
      name: 'Example Frontend Span',
    }, async () => {
      const res = await fetch('/sentry-example');
      if (!res.ok) {
        throw new Error('Sentry Example Frontend Error');
      }
    })
  }
</script>

<h1>Check Build</h1>

<p>
  This route only exists to check that Typescript definitions
  and auto instrumentation are working when the project is built.
</p>
