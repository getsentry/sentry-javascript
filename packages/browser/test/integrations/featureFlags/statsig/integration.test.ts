import { getCurrentScope } from '@sentry/core/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { statsigIntegration } from '../../../../src/integrations/featureFlags/statsig';
import type {
  EventName,
  EventNameToEventDataMap,
  StatsigClient,
} from '../../../../src/integrations/featureFlags/statsig/types';

type GateCallback = (data: EventNameToEventDataMap['gate_evaluation']) => void;
type ExperimentCallback = (data: EventNameToEventDataMap['experiment_evaluation']) => void;

class MockStatsigClient implements StatsigClient {
  gateCallbacks: GateCallback[] = [];
  experimentCallbacks: ExperimentCallback[] = [];

  public on<T extends EventName>(event: T, callback: (data: EventNameToEventDataMap[T]) => void): void {
    if (event === 'experiment_evaluation') {
      this.experimentCallbacks.push(callback as ExperimentCallback);
    } else if (event === 'gate_evaluation') {
      this.gateCallbacks.push(callback as GateCallback);
    }
  }

  public setGate(name: string, value: boolean) {
    this.gateCallbacks.forEach(gateCallback => gateCallback({ gate: { name, value } }));
  }

  public setExperiment(name: string, groupName: string) {
    this.experimentCallbacks.forEach(experimentCallback => experimentCallback({ experiment: { name, groupName } }));
  }
}

describe('statsigIntegration', () => {
  afterEach(() => {
    getCurrentScope().clear();
  });

  it('adds to flags', () => {
    const statsigClient = new MockStatsigClient();
    const integration = statsigIntegration({ featureFlagClient: statsigClient });
    // @ts-expect-error I was too lazy to figure out how to mock a Client.
    integration.setup();

    statsigClient.setGate('gate_name', true);
    statsigClient.setGate('other_gate_name', false);

    expect(getCurrentScope().getScopeData().contexts.flags?.values).toEqual([
      { flag: 'gate_name', result: true },
      { flag: 'other_gate_name', result: false },
    ]);
  });

  it('adds to experiments', () => {
    const statsigClient = new MockStatsigClient();
    const integration = statsigIntegration({ featureFlagClient: statsigClient, includeExperiments: true });
    // @ts-expect-error I was too lazy to figure out how to mock a Client.
    integration.setup();

    statsigClient.setExperiment('experiment_name', 'control');
    statsigClient.setExperiment('other_experiment_name', 'treatment');

    expect(getCurrentScope().getScopeData().contexts.experiments?.values).toEqual([
      { experiment: 'experiment_name', groupName: 'control' },
      { experiment: 'other_experiment_name', groupName: 'treatment' },
    ]);
  });
});
