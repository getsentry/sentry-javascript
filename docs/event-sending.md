# Event processing & sending

This document gives an outline for how event sending works, and which which places it goes through.

## Errors

* `hub.captureException()`
  * `client.captureException()` (see baseclient)
    * `checkOrSetAlreadyCaught()`
    * `baseclient._process()`
    * `baseclient.eventFromException()`
    * `baseclient._captureEvent()`
      * `baseclient._processEvent()`
        * `baseclient._prepareEvent()`
          * `baseclient._applyClientOptions()`
          * `baseclient._applyIntegrationsMetadata()`
          * `scope.applyToEvent()`
          * `baseclient._normalizeEvent()`
        * `baseclient._updateSessionFromEvent()`
        * `baseclient.sendEvent()`
          * `createEventEnvelope()`
            * `getSdkMetadataForEnvelopeHeader()`
            * `enhanceEventWithSdkInfo()`
            * `createEventEnvelopeHeaders()`
            * `createEnvelope()`
          * `addItemToEnvelope()`
            * `createAttachmentEnvelopeItem()`
          * `baseclient._sendEnvelope()`
            * `transport.send()`

## Transactions

* `transaction.finish()`
  * `transaction.getTraceContext()`
  * `transaction.getDynamicSamplingContext()`
  * `hub.captureEvent()`
  * `client.captureEvent()` (see baseclient)
    * `checkOrSetAlreadyCaught()`
    * `baseclient._process()`
    * `baseclient.eventFromException()`
    * `baseclient._captureEvent()`
      * `baseclient._processEvent()`
        * `baseclient._prepareEvent()`
          * `baseclient._applyClientOptions()`
          * `baseclient._applyIntegrationsMetadata()`
          * `scope.applyToEvent()`
          * `baseclient._normalizeEvent()`
        * `baseclient._updateSessionFromEvent()`
        * `baseclient.sendEvent()`
          * `createEventEnvelope()`
            * `getSdkMetadataForEnvelopeHeader()`
            * `enhanceEventWithSdkInfo()`
            * `createEventEnvelopeHeaders()`
            * `createEnvelope()`
          * `addItemToEnvelope()`
            * `createAttachmentEnvelopeItem()`
          * `baseclient._sendEnvelope()`
            * `transport.send()`

## Sessions

* `hub.captureSession()`
  * `hub.endSession()`
    * `closeSession()`
    * `hub._sendSessionUpdate()`
    * `scope.setSession()`
  * `hub._sendSessionUpdate()`
    * `client.captureSession()` (see baseclient)
      * `baseclient.sendSession()`
        * `createSessionEnvelope()`
          * `getSdkMetadataForEnvelopeHeader()`
          * `createEnvelope()`
        * `baseclient._sendEnvelope()`
          * `transport.send()`
      * `updateSession()`

## Replay (WIP)

* `replay.sendReplayRequest()`
  * `createRecordingData()`
  * `prepareReplayEvent()`
    * `client._prepareEvent()` (see baseclient)
      * `baseclient._applyClientOptions()`
      * `baseclient._applyIntegrationsMetadata()`
      * `scope.applyToEvent()`
      * `baseclient._normalizeEvent()`
  * `createReplayEnvelope()`
    * `createEnvelope()`
  * `transport.send()`

## Client Reports

* `browser.client.constructor()`
  * `browser.client._flushOutcomes()`
    * `getEnvelopeEndpointWithUrlEncodedAuth()`
    * `createClientReportEnvelope()`
    * `baseclient._sendEnvelope()`
      * `transport.send()`
