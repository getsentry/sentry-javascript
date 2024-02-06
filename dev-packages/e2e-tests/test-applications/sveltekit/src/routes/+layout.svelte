<script lang="typescript">
  import { onMount } from 'svelte';

  onMount(() => {
    // Indicate that the SvelteKit app was hydrated
    document.body.classList.add('hydrated');
  });
</script>

<slot />
