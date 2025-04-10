<script>
  import * as Sentry from '@sentry/sveltekit';

  import Component1 from "./Component1.svelte";
  import Component2 from "./Component2.svelte";
  import Component3 from "./Component3.svelte";

  Sentry.trackComponent({componentName: 'components/+page', trackUpdates: true})

</script>
<h2>Demonstrating Component Tracking</h2>

<Component1></Component1>
<Component2></Component2>
<Component3></Component3>
