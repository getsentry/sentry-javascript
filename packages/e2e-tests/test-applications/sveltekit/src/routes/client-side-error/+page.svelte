<script>
  function throwError() {
    throw new Error('Client side error');
  }
</script>

<h1>Client side error</h1>

<button on:click={throwError}>Throw error</button>
