import { Git } from '../util/git.js';
import type { Analysis, AnalyzerItemValues } from './analyzer.js';
import { AnalyzerItemMetric, ResultsAnalyzer } from './analyzer.js';
import { Result } from './result.js';
import type { ResultSetItem } from './results-set.js';

function trimIndent(str: string): string {
  return str
    .trim()
    .split('\n')
    .map(s => s.trim())
    .join('\n');
}

function printableMetricName(metric: AnalyzerItemMetric): string {
  switch (metric) {
    case AnalyzerItemMetric.lcp:
      return '<a href="https://web.dev/lcp/" title="Largest Contentful Paint">LCP</a>';
    case AnalyzerItemMetric.cls:
      return '<a href="https://web.dev/cls/" title="Cumulative Layout Shift">CLS</a>';
    case AnalyzerItemMetric.cpu:
      return 'CPU';
    case AnalyzerItemMetric.memoryAvg:
      return 'JS heap avg';
    case AnalyzerItemMetric.memoryMax:
      return 'JS heap max';
    default:
      return AnalyzerItemMetric[metric];
  }
}

export class PrCommentBuilder {
  private _buffer: string = '';

  /**
   *
   */
  public get title(): string {
    return 'Replay SDK metrics :rocket:';
  }

  /**
   *
   */
  public get body(): string {
    const now = new Date();
    return trimIndent(`
      ${this._buffer}
      <hr />
      <div align="right">
        *) pp - <a href="https://en.wikipedia.org/wiki/Percentage_point">percentage points</a> - an absolute difference between two percentages. <br />
        Last updated: <time datetime="${now.toISOString()}">${now.toUTCString()}</time>
      </div>
    `);
  }

  /**
   *
   */
  public async addCurrentResult(analysis: Analysis, otherName: string): Promise<void> {
    // Decides whether to print the "Other" for comparison depending on it being set in the input data.
    const hasOther = analysis.otherHash != undefined;
    const maybeOther = function (content: () => string): string {
      return hasOther ? content() : '';
    };

    const currentHash = await Git.hash;

    this._buffer += `<h2>${this.title}</h2>`;
    if (!hasOther) {
      this._buffer += `Latest data for: ${currentHash}`;
    }
    this._buffer += `
      <table border="1">
        <thead>
        <tr>
          <th rowspan="2">&nbsp;</th>
          ${maybeOther(() => '<th align="left">&nbsp;</th>')}
          <th align="center">Plain</th>
          <th colspan="3" align="center">+Sentry</th>
          <th colspan="3" align="center">+Replay</th>
        </tr>
        <tr>
          ${maybeOther(() => '<th align="left">Revision</th>')}
          <th align="right">Value</th>
          <th align="right">Value</th>
          <th align="right">Diff</th>
          <th align="right">Ratio</th>
          <th align="right">Value</th>
          <th align="right">Diff</th>
          <th align="right">Ratio</th>
        </tr>`;

    const valueColumns = function (values: AnalyzerItemValues): string {
      return `
        <td align="right">${values.value(0)}</td>
        <td align="right">${values.value(1)}</td>
        <td align="right"><strong>${values.diff(0, 1)}</strong></td>
        <td align="right"><strong>${values.percent(0, 1)}</strong></td>
        <td align="right">${values.value(2)}</td>
        <td align="right"><strong>${values.diff(0, 2)}</strong></td>
        <td align="right"><strong>${values.percent(0, 2)}</strong></td>
      `;
    };

    for (const item of analysis.items) {
      if (hasOther) {
        this._buffer += `
        <tr>
          <th rowspan="2" align="left">${printableMetricName(item.metric)}</th>
          <th align="left">This PR ${currentHash}</td>
          ${valueColumns(item.values)}
        </tr>
        <tr>
          <th align="left">${otherName} ${analysis.otherHash}</td>
          ${valueColumns(item.others!)}
        </tr>`;
      } else {
        this._buffer += `
        <tr>
          <th align="left">${printableMetricName(item.metric)}</th>
          ${valueColumns(item.values)}
        </tr>`;
      }
    }

    this._buffer += `
      </table>`;
  }

  /**
   *
   */
  public async addAdditionalResultsSet(name: string, resultFiles: ResultSetItem[]): Promise<void> {
    if (resultFiles.length == 0) return;

    this._buffer += `
      <details>
        <summary><h3>${name}</h3></summary>
        <table border="1">`;

    // Each `resultFile` will be printed as a single row - with metrics as table columns.
    for (let i = 0; i < resultFiles.length; i++) {
      const resultFile = resultFiles[i];
      // Load the file and "analyse" - collect stats we want to print.
      const analysis = await ResultsAnalyzer.analyze(Result.readFromFile(resultFile.path));

      if (i == 0) {
        // Add table header
        this._buffer += '<tr><th>Revision</th>';
        for (const item of analysis.items) {
          this._buffer += `<th align="right">${printableMetricName(item.metric)}</th>`;
        }
        this._buffer += '</tr>';
      }

      // Add table row
      this._buffer += `<tr><th>${resultFile.hash}</th>`;
      for (const item of analysis.items) {
        // TODO maybe find a better way of showing this. After the change to multiple scenarios, this shows diff between "With Sentry" and "With Sentry + Replay"
        this._buffer += `<td align="right">${item.values.diff(0, 2)}</td>`;
      }
      this._buffer += '</tr>';
    }

    this._buffer += `
        </table>
      </details>`;
  }
}
