<script lang="ts">
  function throwError() {
    throw new Error('Click Error');
  }
</script>

<h1>Client error</h1>

<button on:click={throwError}>Throw error</button>
