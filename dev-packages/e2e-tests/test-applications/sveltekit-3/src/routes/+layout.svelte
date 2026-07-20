<script lang="ts">
  import { onMount } from "svelte";

  onMount(() => {
    // Indicate that the SvelteKit app was hydrated
    document.body.classList.add("hydrated");
  });


</script>

<h1>Sveltekit E2E Test app</h1>
<div data-sveltekit-preload-data="off">
  <slot></slot>
</div>
