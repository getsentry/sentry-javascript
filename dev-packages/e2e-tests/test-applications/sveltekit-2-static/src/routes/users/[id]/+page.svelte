<script lang="ts">
import { page } from '$app/stores';
export let data;
</script>

<h1>Route with dynamic params</h1>

<p>
  User id: {$page.params.id}
</p>

<p>
  Secret message for user: {data.msg}
</p>
