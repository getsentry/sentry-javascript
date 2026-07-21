<script>
  import Component3 from "./Component3.svelte";
  import {trackComponent} from '@sentry/sveltekit';

  trackComponent({componentName: 'Component2', trackUpdates: true});
</script>
<h3>Howdy, I'm component 2</h3>

<Component3></Component3>
