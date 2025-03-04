<script lang="ts">
  export let data
</script>

<h1>Type Assertion</h1>

<p>
  TIL:
<code>const myCanvas = <HTMLCanvasElement>document.getElementById("main_canvas");</code>
  is equal to
<code>const myCanvas = document.getElementById("main_canvas") as HTMLCanvasElement;</code>
</p>

<p>
  Message: {data.msg}
</p>
