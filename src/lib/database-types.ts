export const INTERNAL_ROWID_COLUMN = '__rowid__';

export interface RowIdentifier {
  rowid?: number | null;
  primaryKeyValues?: Record<string, unknown>;
}

export type RowValueMap = Record<string, unknown>;
