<script lang="ts">
  export let data
</script>

<h1>Universal load error</h1>

<p>
  To trigger from client: Load on another route, then navigate to this route.
</p>

<p>
  To trigger from server: Load on this route
</p>

<p>
  Message: {data.msg}
</p>
