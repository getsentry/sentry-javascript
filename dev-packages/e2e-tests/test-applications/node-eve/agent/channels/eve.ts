import { none } from 'eve/channels/auth';
import { eveChannel } from 'eve/channels/eve';

// The test drives the agent over localhost in both dev and prod, so the channel
// is left open. Do not copy this into a real deployment.
export default eveChannel({
  auth: [none()],
});
