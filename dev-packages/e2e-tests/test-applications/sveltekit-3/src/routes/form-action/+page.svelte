<script>
  import { enhance } from '$app/forms';

  const { data, form } = $props();
</script>

<form method="post" use:enhance>
  <label for="name">Name:</label>
  <input id="inputName" type="text" name="name" />
  <button id="buttonSubmit" type="submit">Submit</button>
</form>

{#if form?.name}
  <p>Hello {form.name}</p>
{/if}
