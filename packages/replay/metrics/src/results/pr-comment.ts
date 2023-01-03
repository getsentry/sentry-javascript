import { Git } from "../util/git.js";
import { Analysis, AnalyzerItemMetric, ResultsAnalyzer } from "./analyzer.js";
import { Result } from "./result.js";
import { ResultSetItem } from "./results-set.js";

export class PrCommentBuilder {
  private buffer = '';

  public get title(): string {
    return '## Replay SDK metrics :rocket:';
  }

  public get body(): string {
    return this.buffer;
  }

  public addCurrentResult(analysis: Analysis, otherName: string): void {
    // Decides whether to print the "Other" depending on it being set in the input data.
    const maybeOther = function (content: () => string): string {
      if (analysis.otherHash == undefined) {
        return '';
      }
      return content();
    }

    this.buffer += `
      ${this.title}
      <table>
        <tr>
          <th>&nbsp;</th>
          <th align="right">Latest diff (${Git.hash})</th>
          ${maybeOther(() => '<th align="right">' + otherName + ' diff (' + analysis.otherHash + ')</a></th>')}
        </tr>`

    for (const item of analysis.items) {
      this.buffer += `
        <tr>
          <th>${AnalyzerItemMetric[item.metric]}</th>
          <td align="right">${item.value.asString()}</td>
          ${maybeOther(() => '<td align="right">' + item.other!.asString() + '</td>')}
        </tr>`
    }

    this.buffer += `
      </table>`;
  }

  public async addAdditionalResultsSet(name: String, resultFiles: ResultSetItem[]): Promise<void> {
    if (resultFiles.length == 0) return;

    this.buffer += `
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
        this.buffer += '<tr><th>Revision</th>';
        for (const item of analysis.items) {
          this.buffer += `<th align="right">${AnalyzerItemMetric[item.metric]}</th>`;
        }
        this.buffer += '</tr>';
      }

      // Add table row
      this.buffer += `<tr><th>${resultFile.hash}</th>`;
      for (const item of analysis.items) {
        this.buffer += `<td align="right">${item.value.asString()}</td>`;
      }
      this.buffer += '</tr>';
    }

    this.buffer += `
        </table>
      </details>`;
  }
}
