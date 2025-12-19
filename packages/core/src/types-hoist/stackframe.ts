/** JSDoc */
export interface StackFrame {
  filename?: string;
  function?: string;
  module?: string;
  platform?: string;
  lineno?: number;
  colno?: number;
  abs_path?: string;
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  in_app?: boolean;
  instruction_addr?: string;
  addr_mode?: string;
  // TODO: fix in v11, convert any to unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vars?: { [key: string]: any };
  debug_id?: string;
  // TODO: fix in v11, convert any to unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module_metadata?: any;
}
