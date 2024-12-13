<script>
import { trackComponent } from '@sentry/sveltekit';

trackComponent({ componentName: 'Component1' });
</script>
<h3>Howdy, I'm component 1</h3>

<Component2></Component2>
