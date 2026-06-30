import { describe, expect, it } from 'vitest';
import { getSpanName } from '../../../src/integrations/tracing/tedious/vendored/utils';

describe('getSpanName', () => {
  it('names execBulkLoad with the table and database', () => {
    expect(getSpanName('execBulkLoad', 'master', undefined, 'test_bulk')).toBe('execBulkLoad test_bulk master');
  });

  it('names callProcedure with the procedure and database', () => {
    expect(getSpanName('callProcedure', 'master', '[dbo].[test_proced]', undefined)).toBe(
      'callProcedure [dbo].[test_proced] master',
    );
  });

  it('names callProcedure with the procedure when no database', () => {
    expect(getSpanName('callProcedure', undefined, '[dbo].[test_proced]', undefined)).toBe(
      'callProcedure [dbo].[test_proced]',
    );
  });

  it('names a general operation with the database, not the sql', () => {
    expect(getSpanName('execSql', 'master', 'SELECT GETDATE()', undefined)).toBe('execSql master');
  });

  it('names a general operation with just the operation when no database', () => {
    expect(getSpanName('execSql', undefined, 'SELECT GETDATE()', undefined)).toBe('execSql');
  });
});
