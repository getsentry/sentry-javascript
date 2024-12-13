<script>
import * as Sentry from '@sentry/sveltekit';

Sentry.trackComponent({ componentName: 'components/+page' });
</script>
<h2>Demonstrating Component Tracking</h2>

<Component1></Component1>
<Component2></Component2>
<Component3></Component3>
