<script lang="ts">
  import { onMount } from 'svelte';
  import * as Sentry from '@sentry/sveltekit';

  export let data;

  onMount(() => {

      if (data.error) {
        console.log(Sentry.getTraceData());
        throw new Error('Client Error');
      }
  });
</script>

<p>
  Data:
  {data.message || 'nothing'}
</p>
