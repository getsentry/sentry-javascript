<script lang="ts">
  import * as Sentry from '@sentry/sveltekit';
  Sentry.trackComponent({componentName: 'Component3', trackUpdates: true});
</script>

<h3>Howdy, I'm component 3</h3>
