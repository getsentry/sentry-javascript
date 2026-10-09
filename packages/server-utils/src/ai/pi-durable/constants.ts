export const PI_DURABLE_INTEGRATION_NAME = 'PiDurable' as const;

export const PI_DURABLE_ORIGIN = 'auto.ai.pi_durable';

/** Task kinds of the pi-durable built-in tasks. */
export const PI_TASK = {
  GENERATION: 'pi.generation',
  TOOL: 'pi.tool',
  COMPACTION: 'pi.compaction',
} as const;

/** Kind of the built-in document that holds a conversation's run control. */
export const PI_LIVE_DOC_KIND = 'pi.live';

/** Kind of the transcript entry that holds the tool result the model receives. */
export const PI_TOOL_RESULT_ENTRY_KIND = 'pi.tool-result';

/**
 * Cap on open run spans. A run span is removed when the run settles, but a run the process never
 * sees settle (a crash, or a settlement the scheduler writes outside a task phase) would otherwise
 * stay in the map for the lifetime of the process.
 */
export const MAX_TRACKED_PI_RUNS = 1000;
