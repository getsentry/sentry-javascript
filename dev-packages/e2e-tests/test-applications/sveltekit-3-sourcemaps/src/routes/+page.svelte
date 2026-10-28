<script lang="ts">
  // SOURCEMAP_MARKER_CLIENT
  function throwError() {
    throw new Error('Client error');
  }
</script>

<button on:click={throwError}>Throw error</button>
