# Session State Diagrams for Replay Integration

This document provides three Mermaid state diagrams that visualize the Session lifecycle in the Replay integration (`packages/replay-internal/src/replay.ts`). Each diagram offers a different level of detail to help understand how sessions are created, managed, and terminated throughout the replay recording process.

## Purpose

These diagrams help developers understand:
- How replay sessions are initialized and sampled
- The relationship between Session objects and ReplayContainer states
- State transitions triggered by user activity, timeouts, and errors
- The difference between "session" and "buffer" recording modes

## Key Concepts

### Session
A Session represents a single replay recording instance. It contains:
- `id`: Unique session identifier
- `sampled`: Recording mode (`false` = not sampled, `'session'` = full recording, `'buffer'` = error-only recording)
- `segmentId`: Counter for replay segments sent to Sentry (starts at 0)
- `started`: Session start timestamp
- `lastActivity`: Most recent activity timestamp

### Recording Modes
- **Session mode** (`recordingMode: 'session'`): Records continuously and sends data at regular intervals
- **Buffer mode** (`recordingMode: 'buffer'`): Records last 60 seconds only, sent when an error occurs or `flush()` is called

### Container States
The `ReplayContainer` manages the session lifecycle with these key flags:
- `_isEnabled`: Whether the integration is active
- `_isPaused`: Whether DOM recording is paused
- `_requiresManualStart`: Whether recording needs manual initialization

---

## Diagram A: High-Level Session Lifecycle

This diagram shows the core session lifecycle without implementation details, focusing on major states and transitions.

```mermaid
stateDiagram-v2
    [*] --> Uninitialized: ReplayContainer constructed

    Uninitialized --> ActiveSession: initializeSampling() / start() / startBuffering()

    ActiveSession --> Recording: startRecording()

    Recording --> Paused: Idle timeout (5 min, session mode only)
    Paused --> Recording: resume() / user activity

    Recording --> Expired: Session expired (15 min idle / 60 min total)
    Recording --> Stopped: Manual stop() / Error conditions
    ActiveSession --> Stopped: Manual stop()

    Expired --> Refreshing: _refreshSession()
    Refreshing --> Stopped: stop()
    Refreshing --> Uninitialized: initializeSampling()

    Stopped --> [*]: Session cleared

    note right of Recording
        DOM events captured
        Performance data collected
        Periodic flushes to Sentry
    end note

    note right of Paused
        DOM recording stopped
        No new events captured
        Waiting for user activity
    end note
```

---

## Diagram B: Detailed State Machine

This comprehensive diagram shows all states, transitions, and error conditions including the relationship between Session sampling states and Container states.

```mermaid
stateDiagram-v2
    [*] --> Constructed: new ReplayContainer()

    state Constructed {
        [*] --> CheckSampleRates: initializeSampling()
        CheckSampleRates --> RequiresManualStart: Both rates = 0
        CheckSampleRates --> LoadOrCreateSession: At least one rate > 0

        LoadOrCreateSession --> SessionExists: Sticky session found
        LoadOrCreateSession --> CreateNewSession: No existing session

        SessionExists --> CheckExpiry
        CheckExpiry --> UseExisting: Not expired
        CheckExpiry --> CreateNewSession: Expired

        CreateNewSession --> DetermineSampling
        DetermineSampling --> SampledFalse: Not sampled (sessionSampleRate)
        DetermineSampling --> SampledBuffer: Sampled for buffer (errorSampleRate > 0)
        DetermineSampling --> SampledSession: Sampled for session

        SampledFalse --> [*]: No recording (stop)
        RequiresManualStart --> WaitingForManualStart
    }

    WaitingForManualStart --> ManualSessionMode: start() called
    WaitingForManualStart --> ManualBufferMode: startBuffering() called

    state "Recording Active" as RecordingState {
        state "Session Mode" as SessionMode {
            [*] --> RecordingSession: _initializeRecording()
            RecordingSession --> FlushingSession: Debounced flush
            FlushingSession --> RecordingSession: Flush complete
            RecordingSession --> CheckingActivity: Activity check

            CheckingActivity --> RecordingSession: Recent activity
            CheckingActivity --> IdlePaused: Idle > 5 min
            IdlePaused --> RecordingSession: resume() / user activity
        }

        state "Buffer Mode" as BufferMode {
            [*] --> RecordingBuffer: _initializeRecording()
            RecordingBuffer --> ConvertingToSession: sendBufferedReplayOrFlush()
            ConvertingToSession --> FlushingBuffer: Flush buffer
            FlushingBuffer --> [*]: Stop recording
            FlushingBuffer --> SessionMode: continueRecording=true
        }
    }

    SampledSession --> SessionMode: recordingMode = 'session'
    SampledBuffer --> BufferMode: recordingMode = 'buffer'
    ManualSessionMode --> SessionMode
    ManualBufferMode --> BufferMode

    state "Error Conditions" as ErrorState {
        [*] --> RateLimited: Rate limit hit
        [*] --> MutationLimit: Too many mutations
        [*] --> SendError: Network error (3 retries)
        [*] --> TooLong: Duration > 60 min + 30s

        RateLimited --> ForcedStop
        MutationLimit --> ForcedStop
        SendError --> ForcedStop
        TooLong --> ForcedStop
    }

    RecordingState --> ErrorState: Error condition met
    ErrorState --> Stopped

    RecordingState --> CheckExpiry: checkAndHandleExpiredSession()

    state CheckExpiry {
        [*] --> ValidSession: Session valid
        [*] --> ExpiredSession: Session expired

        ExpiredSession --> RefreshNeeded: shouldRefreshSession = true
        ExpiredSession --> ContinueBuffer: Buffer mode, segmentId=0

        RefreshNeeded --> [*]: Trigger refresh
        ContinueBuffer --> [*]: Continue buffering
    }

    CheckExpiry --> RecordingState: ValidSession
    CheckExpiry --> RefreshSession: RefreshNeeded

    RefreshSession --> Stopped: stop(reason='refresh')
    RefreshSession --> Constructed: initializeSampling(previousSessionId)

    RecordingState --> Stopped: stop() called
    Stopped --> [*]: clearSession()

    note right of SessionMode
        Continuous recording
        segmentId increments on flush
        Flushes every 5-5.5s
    end note

    note right of BufferMode
        Last 60s buffered
        Only sent on error or flush()
        segmentId stays at 0 until first flush
    end note

    note right of IdlePaused
        _isPaused = true
        stopRecording() called
        No new DOM events
    end note
```

---

## Diagram C: Sampling and Recording Modes Focus

This diagram emphasizes the sampling decision tree and how recording modes are determined and can transition.

```mermaid
stateDiagram-v2
    [*] --> SamplingDecision

    state SamplingDecision {
        [*] --> CheckRates

        state CheckRates <<choice>>
        CheckRates --> ManualPath: sessionSampleRate=0 AND errorSampleRate=0
        CheckRates --> AutoPath: At least one rate > 0

        state ManualPath {
            [*] --> ManualStartRequired: _requiresManualStart = true
            ManualStartRequired --> AwaitManualStart

            state AwaitManualStart <<choice>>
            AwaitManualStart --> ManualSession: start() → sampled='session'
            AwaitManualStart --> ManualBuffer: startBuffering() → sampled='buffer'
        }

        state AutoPath {
            [*] --> SampleRateCheck

            state SampleRateCheck <<choice>>
            SampleRateCheck --> NotSampled: isSampled(sessionSampleRate) = false
            SampleRateCheck --> SessionSampled: isSampled(sessionSampleRate) = true

            state NotSampled {
                [*] --> CheckBuffering
                state CheckBuffering <<choice>>
                CheckBuffering --> NoRecording: errorSampleRate = 0
                CheckBuffering --> BufferSampled: errorSampleRate > 0

                NoRecording --> [*]: sampled = false (stop)
                BufferSampled --> [*]: sampled = 'buffer'
            }

            SessionSampled --> [*]: sampled = 'session'
        }
    }

    ManualSession --> SessionRecording
    ManualBuffer --> BufferRecording
    NotSampled --> [*]
    AutoPath --> SessionRecording: sampled='session'
    AutoPath --> BufferRecording: sampled='buffer'

    state "Session Recording (recordingMode='session')" as SessionRecording {
        [*] --> SegmentZero: segmentId = 0
        SegmentZero --> FlushOne: First flush
        FlushOne --> SegmentOne: segmentId = 1
        SegmentOne --> FlushTwo: Subsequent flush
        FlushTwo --> SegmentTwo: segmentId = 2
        SegmentTwo --> MoreSegments: Continue...

        note right of SegmentZero
            Initial checkout
            eventBuffer.hasCheckout = true
            Collects initial state
        end note

        note right of SegmentOne
            Incremental data
            Each flush increments segmentId
            Sent continuously
        end note
    }

    state "Buffer Recording (recordingMode='buffer')" as BufferRecording {
        [*] --> BufferingSegmentZero: segmentId = 0
        BufferingSegmentZero --> BufferingSegmentZero: Keep last 60s

        state ErrorOrFlushTrigger <<choice>>
        BufferingSegmentZero --> ErrorOrFlushTrigger: Error captured / flush() called

        ErrorOrFlushTrigger --> FlushBufferOnly: continueRecording=false
        ErrorOrFlushTrigger --> ConvertToSession: continueRecording=true

        FlushBufferOnly --> BufferSegmentOne: segmentId = 1
        BufferSegmentOne --> [*]: Stop

        ConvertToSession --> SessionSegmentOne: segmentId = 1, recordingMode='session'
        SessionSegmentOne --> SessionRecording: Continue as session

        note right of BufferingSegmentZero
            Rolling buffer
            segmentId stays at 0
            Only sent on trigger
        end note

        note right of ConvertToSession
            sendBufferedReplayOrFlush()
            Flushes buffer first
            Then switches to session mode
            Common after error capture
        end note
    }

    SessionRecording --> [*]: Session ends
    BufferRecording --> [*]: Session ends

    note left of SamplingDecision
        Sample rates determine initial mode:
        - sessionSampleRate: % of sessions to record fully
        - errorSampleRate: % of sessions to buffer for errors
        - Both=0: Manual start required
    end note
```

---

## Notes and Reference

### Timeout Durations

From `constants.ts`:
- `SESSION_IDLE_PAUSE_DURATION`: 300,000ms (5 minutes) - After this idle time, recording pauses (session mode only)
- `SESSION_IDLE_EXPIRE_DURATION`: 900,000ms (15 minutes) - After this idle time, session expires and refreshes
- `MAX_REPLAY_DURATION`: 3,600,000ms (60 minutes) - Maximum total session length
- `BUFFER_CHECKOUT_TIME`: 60,000ms (60 seconds) - Buffer recording checkout interval

### Key Methods

#### Initialization Methods
- **`initializeSampling(previousSessionId?)`** (lines 317-353)
  - Called automatically in constructor if any sample rate > 0
  - Loads or creates session based on sample rates
  - Sets `recordingMode` based on `session.sampled` value

- **`start()`** (lines 362-398)
  - Manually starts recording in session mode
  - Always creates a new session with `sampled: 'session'`
  - Sets `recordingMode = 'session'`

- **`startBuffering()`** (lines 404-428)
  - Manually starts recording in buffer mode
  - Creates session with `sampled: 'buffer'`
  - Sets `recordingMode = 'buffer'`

#### State Management Methods
- **`startRecording()`** (lines 435-472)
  - Calls rrweb's `record()` function
  - Starts DOM recording with appropriate checkout time
  - Sets `_stopRecording` function reference

- **`stopRecording()`** (lines 480-492)
  - Stops the rrweb recording
  - Clears `_stopRecording` reference
  - Does not clear session

- **`pause()`** (lines 543-552)
  - Sets `_isPaused = true`
  - Stops DOM recording
  - Session remains active

- **`resume()`** (lines 560-569)
  - Sets `_isPaused = false`
  - Restarts DOM recording (new checkout)
  - Checks session validity first

- **`stop({forceFlush?, reason?})`** (lines 498-536)
  - Sets `_isEnabled = false`
  - Removes all listeners
  - Optionally flushes remaining data
  - Clears session from storage

#### Session Lifecycle Methods
- **`checkAndHandleExpiredSession()`** (lines 742-769)
  - Checks if session should pause due to inactivity
  - Checks if session is expired
  - Automatically refreshes expired sessions
  - Returns false if session expired

- **`_refreshSession(session)`** (lines 925-931)
  - Stops current recording without forcing flush
  - Calls `initializeSampling(session.id)` with previous session ID
  - Creates new session with same sampling logic

- **`sendBufferedReplayOrFlush({continueRecording?})`** (lines 578-615)
  - Converts buffer mode to session mode
  - Flushes buffered data first
  - Optionally continues in session mode
  - Typically called after error capture

### Relationship Between `session.sampled` and `recordingMode`

The `session.sampled` property is set once during session creation and determines the initial recording behavior:

| `session.sampled` | Initial `recordingMode` | Behavior |
|-------------------|------------------------|----------|
| `false` | N/A (not recording) | Session not sampled, integration stops |
| `'buffer'` | `'buffer'` | Records last 60s, can convert to session mode |
| `'session'` | `'session'` | Records continuously from start |

**Important**: When a session is sampled for buffer mode but has already sent data (`segmentId > 0`), it will initialize in session mode on page reload to maintain consistency.

```typescript
// From initializeSampling() lines 348-349
this.recordingMode =
  this.session.sampled === 'buffer' && this.session.segmentId === 0
    ? 'buffer'
    : 'session';
```

### Activity Tracking

User activity updates both:
1. `_lastActivity` - Timestamp that persists across session lifespans
2. `session.lastActivity` - Timestamp stored in the session object

Methods that update activity:
- `triggerUserActivity()` - Updates timestamps and resumes recording if paused
- `updateUserActivity()` - Updates timestamps only (for low-value events like keydown)
- `_updateUserActivity(timestamp?)` - Internal method to set `_lastActivity`
- `_updateSessionActivity(timestamp?)` - Internal method to set `session.lastActivity`

### Error Conditions Leading to Stop

Recording can be forcefully stopped due to:
1. **Mutation limit exceeded** (line 1354-1358) - `stop({reason: 'mutationLimit', forceFlush: session mode})`
2. **Rate limiting** (line 1220) - `stop({reason: 'sendReplay'})` + recorded as dropped event
3. **Send errors after 3 retries** (line 1215) - `stop({reason: 'sendReplay'})`
4. **Session too long** (line 1187) - Throws error during flush if duration > 60 min + 30s buffer

### Segment ID Progression

The `segmentId` counter tracks how many replay segments have been sent:
- Starts at 0 when session is created
- Incremented before each flush (line 1192): `const segmentId = this.session.segmentId++`
- Stays at 0 in buffer mode until first flush
- Used by backend to reconstruct replay timeline
- Preserved in sticky sessions across page reloads

---

## Related Files

- **Main implementation**: `packages/replay-internal/src/replay.ts`
- **Session interface**: `packages/replay-internal/src/types/replay.ts` (lines 358-386)
- **Session utilities**:
  - `packages/replay-internal/src/session/loadOrCreateSession.ts`
  - `packages/replay-internal/src/session/createSession.ts`
  - `packages/replay-internal/src/session/shouldRefreshSession.ts`
  - `packages/replay-internal/src/session/clearSession.ts`
  - `packages/replay-internal/src/session/saveSession.ts`
- **Constants**: `packages/replay-internal/src/constants.ts`

