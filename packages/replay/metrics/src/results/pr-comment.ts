import { Git } from '../util/git.js';
import { Analysis, AnalyzerItemMetric, ResultsAnalyzer } from './analyzer.js';
import { Result } from './result.js';
import { ResultSetItem } from './results-set.js';

function trimIndent(str: string): string {
  return str.split('\n').map(s => s.trim()).join('\n');
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

  public get title(): string {
    return 'Replay SDK metrics :rocket:';
  }

  public get body(): string {
    return trimIndent(this._buffer);
  }

  public async addCurrentResult(analysis: Analysis, otherName: string): Promise<void> {
    // Decides whether to print the "Other" depending on it being set in the input data.
    const maybeOther = function (content: () => string): string {
      if (analysis.otherHash == undefined) {
        return '';
      }
      return content();
    }

    this._buffer += `
      <h2>${this.title}</h2>
      <table>
        <thead>`;

    const headerCols = '<th align="right">Plain</th><th align="right">+Replay</th><th align="right">Diff</th>';
    if (analysis.otherHash != undefined) {
      // If "other" is defined, add an aditional row of headers.
      this._buffer += `
        <tr>
          <th rowspan="2">&nbsp;</th>
          <th colspan="3" align="center">This PR (${await Git.hash})</th>
          <th colspan="3" align="center">${otherName} (${analysis.otherHash})</a></th>
        </tr>
        <tr>
          ${headerCols}
          ${headerCols}
        </tr>`;
    } else {
      this._buffer += `
        <tr>
          <th>&nbsp;</th>
          ${headerCols}
        </tr>`;
    }

    for (const item of analysis.items) {
      this._buffer += `
        <tr>
          <th align="right">${printableMetricName(item.metric)}</th>
          <td align="right">${item.value.a}</td>
          <td align="right">${item.value.b}</td>
          <td align="right"><strong>${item.value.diff}</strong></td>
          ${maybeOther(() => `
            <td align="right">${item.other!.a}</td>
            <td align="right">${item.other!.b}</td>
            <td align="right"><strong>${item.other!.diff}</strong></td>`)}
        </tr>`
    }

    this._buffer += `
      </table>`;
  }

  public async addAdditionalResultsSet(name: string, resultFiles: ResultSetItem[]): Promise<void> {
    if (resultFiles.length == 0) return;

    this._buffer += `
      <details>
        <summary><h3>${name}</h3></summary>
        <table>`;

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
        this._buffer += `<td align="right">${item.value.diff}</td>`;
      }
      this._buffer += '</tr>';
    }

    this._buffer += `
        </table>
      </details>`;
  }
}
