<script lang="ts">
  import favicon from '$lib/assets/favicon.svg';
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(() => {
    document.body.classList.add('hydrated');
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<h1>SvelteKit Orchestrion E2E Test app</h1>
<div data-sveltekit-preload-data="off">
  {@render children()}
</div>
