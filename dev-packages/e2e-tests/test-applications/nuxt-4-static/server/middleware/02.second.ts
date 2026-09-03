import { eventHandler, setHeader } from '#imports';

// tests out the eventHandler alias
export default eventHandler(async event => {
  // Set a header to indicate this middleware ran
  setHeader(event, 'x-second-middleware', 'executed');
});
