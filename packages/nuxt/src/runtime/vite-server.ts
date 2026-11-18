import { useServerHooks } from 'nuxt/server';
import { addSentryTracingMetaTags } from './utils';

// The Vite server has no route cache, so every page gets the trace of its own request.
useServerHooks().hook('render:html', html => {
  addSentryTracingMetaTags(html.head);
});
