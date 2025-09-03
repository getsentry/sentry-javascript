const NODE_OVERHEAD_RESULTS_HEADER = ['Scenario', 'Requests/s', '% of Baseline', 'Prev. Requests/s', 'Change %'];

const ROUND_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatResults(baseScenarios, currentScenarios) {
  const headers = NODE_OVERHEAD_RESULTS_HEADER;

  const scenarios = getScenarios(baseScenarios, currentScenarios);
  const rows = [headers];

  scenarios.forEach(scenario => {
    const base = baseScenarios?.[scenario];
    const current = currentScenarios?.[scenario];
    const baseline = current?.baseline;

    rows.push(formatResult(`${scenario} Baseline`, base?.baseline, current?.baseline));
    rows.push(formatResult(`${scenario} With Sentry`, base?.withInstrument, current?.withInstrument, baseline));
    rows.push(
      formatResult(
        `${scenario} With Sentry (error only)`,
        base?.withInstrumentErrorOnly,
        current?.withInstrumentErrorOnly,
        baseline,
      ),
    );
  });

  return rows;
}
export function hasChanges(baseScenarios, currentScenarios, threshold = 0) {
  if (!baseScenarios || !currentScenarios) {
    return true;
  }

  const names = ['baseline', 'withInstrument', 'withInstrumentErrorOnly'];
  const scenarios = getScenarios(baseScenarios, currentScenarios);

  return scenarios.some(scenario => {
    const base = baseScenarios?.[scenario];
    const current = currentScenarios?.[scenario];

    return names.some(name => {
      const baseResult = base[name];
      const currentResult = current[name];

      if (!baseResult || !currentResult) {
        return true;
      }

      return Math.abs((currentResult - baseResult) / baseResult) * 100 > threshold;
    });
  });
}

function formatResult(name, base, current, baseline) {
  const currentValue = current ? ROUND_NUMBER_FORMATTER.format(current) : '-';
  const baseValue = base ? ROUND_NUMBER_FORMATTER.format(base) : '-';

  return [
    name,
    currentValue,
    baseline != null ? formatPercentageDecrease(baseline, current) : '-',
    baseValue,
    formatPercentageChange(base, current),
  ];
}

function formatPercentageChange(baseline, value) {
  if (!baseline) {
    return 'added';
  }

  if (!value) {
    return 'removed';
  }

  const percentage = ((value - baseline) / baseline) * 100;
  return formatChange(percentage);
}

function formatPercentageDecrease(baseline, value) {
  if (!baseline) {
    return 'added';
  }

  if (!value) {
    return 'removed';
  }

  const percentage = (value / baseline) * 100;
  return `${ROUND_NUMBER_FORMATTER.format(percentage)}%`;
}

function formatChange(value) {
  if (value === 0) {
    return '-';
  }

  if (value > 0) {
    return `+${ROUND_NUMBER_FORMATTER.format(value)}%`;
  }

  return `${ROUND_NUMBER_FORMATTER.format(value)}%`;
}

function getScenarios(baseScenarios = {}, currentScenarios = {}) {
  return Array.from(new Set([...Object.keys(baseScenarios), ...Object.keys(currentScenarios)]));
}
