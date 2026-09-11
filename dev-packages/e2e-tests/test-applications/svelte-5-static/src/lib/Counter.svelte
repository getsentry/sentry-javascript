<script lang="ts">
	let count = $state(0);

  function increment() {
    count += 1;
  }

  let doubled = $derived(count * 2);
</script>

<button onclick={increment}>
  count is {count}
</button>

<p>
  doubled: {doubled}
</p>
