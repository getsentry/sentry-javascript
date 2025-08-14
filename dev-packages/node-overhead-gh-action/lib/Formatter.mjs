import * as core from '@actions/core';
import bytes from 'bytes-iec';

const NODE_OVERHEAD_RESULTS_HEADER = ['Scenario', 'Prev Requests/s', 'New Requests/s', 'Change %'];

export class Formatter {
  formatPercentageChange(base = 0, current = 0) {
    const value = ((current - base) / base) * 100;
    const formatted = (Math.sign(value) * Math.ceil(Math.abs(value) * 100)) / 100;

    if (value > 0) {
      return `+${formatted}%`;
    }

    if (value === 0) {
      return '-';
    }

    return `${formatted}%`;
  }

  formatSizeResult(name, base, current) {
    if (!current.passed) {
      core.debug(
        `Size limit exceeded for ${name} - ${this.formatBytes(current.size)} > ${this.formatBytes(current.sizeLimit)}`,
      );
    }

    return [name, base, current, this.formatPercentageChange(base, current)];
  }

  hasSizeChanges(base, current, threshold = 0) {
    if (!base || !current) {
      return true;
    }

    const names = ['baseline', 'withInstrument', 'withInstrumentErrorOnly'];

    return names.some(name => {
      const baseResult = base[name];
      const currentResult = current[name];

      if (!baseResult || !currentResult) {
        return true;
      }

      return Math.abs((currentResult.size - baseResult.size) / baseResult.size) * 100 > threshold;
    });
  }

  formatResults(base, current) {
    const headers = NODE_OVERHEAD_RESULTS_HEADER;

    return [
      headers,
      this.formatSizeResult('Baseline', base.baseline, current.baseline),
      this.formatSizeResult('With Sentry', base.withInstrument, current.withInstrument),
      this.formatSizeResult('With Sentry (error only)', base.withInstrumentErrorOnly, current.withInstrumentErrorOnly),
    ];
  }
}
