<script lang="ts">
  export let data
</script>

<h1>Type Assertion</h1>

<p>
  This route only exists to ensure we don't emit a build error because of the angle bracket type assertion in +page.ts
  see https://github.com/getsentry/sentry-javascript/issues/9318
</p>

<p>
  Message: {data.msg}
</p>
