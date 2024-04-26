<script lang="ts">
  export let data;
  console.log(data);
</script>

<h2>Fetching in universal load</h2>

<p>Here's a list of a few users:</p>

<ul>
  {#each data.users as user}
    <li>{user}</li>
  {/each}
</ul>
