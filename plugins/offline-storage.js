/**
 * Offline Storage plugin
 * 
 * Stores errors failed to get send and try to send them when
 * Networkf comes back or on init
 */

var offlineStorageKey = 'raven-js-offline-queue';

function offlineStoragePlugin(Raven, options) {
  options = options || {};

  function processOfflineQueue() {
    // Let's stop here if there's no connection
    if (!navigator.onLine) {
      return;
    }

    try {
      // Get the queue
      var queue = JSON.parse(localStorage.getItem(offlineStorageKey)) || [];

      // Store an empty queue. If processing these one fails they get back to the queue
      localStorage.removeItem(offlineStorageKey);

      queue.forEach(function processOfflinePayload(data) {
        // Avoid duplication verification for offline stored
        // as they may try multiple times to be processed
        Raven._lastData = null;

        // Try to process it again
        Raven._sendProcessedPayload(data);
      });
    } catch (error) {
      Raven._logDebug('error', 'Raven transport failed to store offline: ', error);
    }
  }

  // Process queue on start
  processOfflineQueue();

  // Add event listener on onravenFailure and store error on localstorage
  document.addEventListener('ravenFailure', function(event) {
    if (!event.data) {
      return;
    }

    try {
      var queue = JSON.parse(localStorage.getItem(offlineStorageKey)) || [];
      queue.push(event.data);
      localStorage.setItem(offlineStorageKey, JSON.stringify(queue));
    } catch (error) {
      Raven._logDebug('error', 'Raven failed to store payload offline: ', error);
    }
  });

  // Add event listener on online or custom event to trigger offline queue sending
  window.addEventListener(options.onlineEventName || 'online', processOfflineQueue);
}

module.exports = offlineStoragePlugin;
