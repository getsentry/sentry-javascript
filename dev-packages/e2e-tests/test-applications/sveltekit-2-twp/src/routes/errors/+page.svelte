<script lang="ts">
  import { onMount } from 'svelte';

  export let data;

  onMount(() => {
      if (data.error) {
        throw new Error('Client Error');
      }
  });
</script>

<p>
  Data:
  {data.message || 'nothing'}
</p>
