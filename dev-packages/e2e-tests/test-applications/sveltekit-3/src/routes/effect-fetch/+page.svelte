<script lang="ts">
  let responses = $state(0);

  $effect(() => {
    fetch('/api/users').then(() => {
      responses++;
    });
  });
</script>

<p id="effect-fetch-responses">responses: {responses}</p>
<a href="/effect-fetch?q=1">Same route, new query</a>
<a href="/nav1">Leave page</a>
