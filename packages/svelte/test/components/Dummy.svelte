<script>
  import { onMount, beforeUpdate, afterUpdate } from 'svelte';
  import * as Sentry from '../../src/index';

  // Pass options to trackComponent as props of this component
  export let options;

  Sentry.trackComponent(options);
</script>

<h1>Hi, I'm a dummy component for testing</h1>
