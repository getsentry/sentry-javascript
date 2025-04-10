<script>
  import Component2 from "./Component2.svelte";
  import {trackComponent} from '@sentry/sveltekit';

  trackComponent({componentName: 'Component1', trackUpdates: true});

</script>
<h3>Howdy, I'm component 1</h3>

<Component2></Component2>
