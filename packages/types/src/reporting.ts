// Types from here
// https://www.w3.org/TR/CSP3/

interface Base {
  readonly age?: number;
  readonly body?: unknown;
  readonly url: string;
  readonly user_agent?: string;
}

type CrashReportPayload = {
  readonly crashId?: string;
  readonly reason?: 'unresponsive' | 'oom';
  readonly stack?: string;
};

interface CrashReport extends Base {
  readonly type: 'crash';
  readonly body: CrashReportPayload;
}

type Disposition = 'enforce' | 'report' | 'reporting';

export interface CSPReportPayload {
  readonly blockedURI?: string;
  readonly blockedURL?: string;
  readonly columnNumber?: number;
  readonly disposition: Disposition;
  readonly documentURI: string;
  readonly documentURL: string;
  readonly effectiveDirective: string;
  readonly lineNumber?: number;
  readonly originalPolicy: string;
  readonly referrer?: string;
  readonly sample?: string;
  readonly sourceFile?: string;
  readonly statusCode: number;
}

export interface CSPReport extends Base {
  readonly type: 'csp-violation';
  readonly body: CSPReportPayload;
}

export type Report = CrashReport | CSPReport;

export interface DeprecatedCSPReport {
  readonly 'csp-report': {
    readonly 'document-uri'?: string;
    readonly referrer?: string;
    readonly 'blocked-uri'?: string;
    readonly 'effective-directive'?: string;
    readonly 'violated-directive'?: string;
    readonly 'original-policy'?: string;
    readonly disposition: Disposition;
    readonly 'status-code'?: number;
    readonly status?: string;
    readonly 'script-sample'?: string;
    readonly sample?: string;
  };
}
