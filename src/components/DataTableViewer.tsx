'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Search, RowsIcon, Settings, ArrowUpDown, ArrowUp, ArrowDown, Plus, Pencil, Trash2, Filter, X } from 'lucide-react';
import { clientDatabaseManager, QueryResult, ColumnInfo } from '@/lib/client-database';
import { BlobImage } from '@/components/BlobImage';
import { TableTabs } from '@/components/TableTabs';
import { INTERNAL_ROWID_COLUMN, RowIdentifier, RowValueMap } from '@/lib/database-types';



interface DataTableViewerProps {
  tableName: string | null;
  selectedDatabase: string | null;
  onTableSelect: (tableName: string) => void;
}

type SortDirection = 'asc' | 'desc' | null;

interface RowMeta {
  identifier: RowIdentifier;
  values: Record<string, unknown>;
  rowid?: number | null;
}

interface FieldState {
  value: string;
  isNull: boolean;
  disabled?: boolean;
}

type FilterOperator = 'equals' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'not_null' | 'is_null';

interface ColumnFilter {
  columnName: string;
  operator: FilterOperator;
  values: (string | number | null)[];
  rangeStart?: number;
  rangeEnd?: number;
}

export function DataTableViewer({ tableName, selectedDatabase, onTableSelect }: DataTableViewerProps) {
  const [data, setData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [multilineColumns, setMultilineColumns] = useState<Set<string>>(new Set());
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [stickyColumn, setStickyColumn] = useState<string | null>(null);
  const [tableColumns, setTableColumns] = useState<ColumnInfo[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('edit');
  const [editorRowMeta, setEditorRowMeta] = useState<RowMeta | null>(null);
  const [formState, setFormState] = useState<Record<string, FieldState>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; columnName: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowMeta: RowMeta } | null>(null);
  const [columnHeaderContextMenu, setColumnHeaderContextMenu] = useState<{ x: number; y: number; columnName: string } | null>(null);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [filteringColumn, setFilteringColumn] = useState<string | null>(null);
  const [columnDistinctValues, setColumnDistinctValues] = useState<(string | number | null)[]>([]);
  const [loadingDistinctValues, setLoadingDistinctValues] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ColumnFilter[]>([]);
  const [tempFilterOperator, setTempFilterOperator] = useState<FilterOperator>('in');
  const [tempFilterValues, setTempFilterValues] = useState<Set<string | number | null>>(new Set());
  const [tempRangeStart, setTempRangeStart] = useState<string>('');
  const [tempRangeEnd, setTempRangeEnd] = useState<string>('');
  const quoteIdentifier = useCallback((identifier: string) => `"${identifier.replace(/"/g, '""')}"`, []);

  useEffect(() => {
    if (tableName) {
      setCurrentPage(1);
      setSearchTerm('');
      setSortColumn(null);
      setSortDirection(null);
      setMultilineColumns(new Set()); // Reset multiline settings
      setStickyColumn(null); // Reset sticky column setting
      setActiveFilters([]); // Reset filters
      fetchTableData(tableName, 1, '', []);
    }
  }, [tableName]);

  useEffect(() => {
    let cancelled = false;
    const loadColumns = async () => {
      if (!tableName) {
        if (!cancelled) {
          setTableColumns([]);
        }
        return;
      }

      try {
        const cols = await clientDatabaseManager.getTableColumns(tableName);
        if (!cancelled) {
          setTableColumns(cols);
        }
      } catch (error) {
        console.error('Error loading table columns:', error);
        if (!cancelled) {
          setTableColumns([]);
        }
      }
    };

    loadColumns();
    return () => {
      cancelled = true;
    };
  }, [tableName, selectedDatabase]);

  useEffect(() => {
    if (data && data.columns.length > 0) {
      const displayColumns = data.columns.filter(col => col !== INTERNAL_ROWID_COLUMN);
      setVisibleColumns(new Set(displayColumns));

      const defaultWidths: Record<string, number> = {};
      displayColumns.forEach(col => {
        defaultWidths[col] = 200;
      });
      setColumnWidths(defaultWidths);
      setStickyColumn(displayColumns[0] ?? null);
    }
  }, [data?.columns]);

  const fetchTableData = useCallback(async (table: string, page: number = currentPage, search: string = searchTerm, filters: ColumnFilter[] = activeFilters) => {
    setLoading(true);
    try {
      const offset = (page - 1) * itemsPerPage;
      
      let result: QueryResult;
      
      if (search || (sortColumn && sortDirection) || filters.length > 0) {
        const safeTable = quoteIdentifier(table);
        const rowIdAlias = quoteIdentifier(INTERNAL_ROWID_COLUMN);
        let query = `SELECT rowid as ${rowIdAlias}, * FROM ${safeTable}`;

        const whereConditions: string[] = [];

        // Add search conditions
        if (search) {
          const escapedSearch = search.replace(/'/g, "''");
          const columns = await clientDatabaseManager.getTableColumns(table);
          const searchConditions = columns
            .map(col => `${quoteIdentifier(col.name)} LIKE '%${escapedSearch}%'`)
            .join(' OR ');
          whereConditions.push(`(${searchConditions})`);
        }

        // Add filter conditions
        if (filters.length > 0) {
          for (const filter of filters) {
            const colName = quoteIdentifier(filter.columnName);
            let filterCondition = '';

            switch (filter.operator) {
              case 'equals':
                if (filter.values[0] === null) {
                  filterCondition = `${colName} IS NULL`;
                } else {
                  const escapedValue = typeof filter.values[0] === 'string' 
                    ? `'${String(filter.values[0]).replace(/'/g, "''")}'` 
                    : filter.values[0];
                  filterCondition = `${colName} = ${escapedValue}`;
                }
                break;
              case 'in':
                if (filter.values.length > 0) {
                  const nullValues = filter.values.filter(v => v === null);
                  const nonNullValues = filter.values.filter(v => v !== null);
                  
                  const conditions: string[] = [];
                  if (nonNullValues.length > 0) {
                    const valuesList = nonNullValues.map(v => 
                      typeof v === 'string' ? `'${String(v).replace(/'/g, "''")}'` : v
                    ).join(', ');
                    conditions.push(`${colName} IN (${valuesList})`);
                  }
                  if (nullValues.length > 0) {
                    conditions.push(`${colName} IS NULL`);
                  }
                  
                  filterCondition = conditions.length > 1 ? `(${conditions.join(' OR ')})` : conditions[0];
                }
                break;
              case 'gt':
                filterCondition = `${colName} > ${filter.values[0]}`;
                break;
              case 'gte':
                filterCondition = `${colName} >= ${filter.values[0]}`;
                break;
              case 'lt':
                filterCondition = `${colName} < ${filter.values[0]}`;
                break;
              case 'lte':
                filterCondition = `${colName} <= ${filter.values[0]}`;
                break;
              case 'between':
                filterCondition = `${colName} BETWEEN ${filter.rangeStart} AND ${filter.rangeEnd}`;
                break;
              case 'is_null':
                filterCondition = `${colName} IS NULL`;
                break;
              case 'not_null':
                filterCondition = `${colName} IS NOT NULL`;
                break;
            }

            if (filterCondition) {
              whereConditions.push(filterCondition);
            }
          }
        }

        if (whereConditions.length > 0) {
          query += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        if (sortColumn && sortDirection) {
          query += ` ORDER BY ${quoteIdentifier(sortColumn)} ${sortDirection.toUpperCase()}`;
        }

        query += ` LIMIT ${itemsPerPage} OFFSET ${offset}`;

        result = await clientDatabaseManager.executeQuery(query);

        let countQuery = `SELECT COUNT(*) as count FROM ${safeTable}`;
        if (whereConditions.length > 0) {
          countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
        }
        const countResult = await clientDatabaseManager.executeQuery(countQuery);
        const totalCount = countResult.rows[0]?.[0] || 0;
        
    // Attach total count for pagination UI
    result.totalCount = Number(totalCount) || 0;
        result.limit = itemsPerPage;
        result.offset = offset;
      } else {
        // Use the optimized getTableData method for simple pagination
        result = await clientDatabaseManager.getTableData(table, itemsPerPage, offset);
      }
      
      setData(result);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching table data:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, activeFilters, itemsPerPage, sortColumn, sortDirection, quoteIdentifier]);

  const displayColumns = useMemo(() => (data?.columns ?? []).filter(col => col !== INTERNAL_ROWID_COLUMN), [data?.columns]);

  const columnIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    data?.columns?.forEach((col, index) => {
      map.set(col, index);
    });
    return map;
  }, [data?.columns]);

  const primaryKeyColumns = useMemo(
    () => tableColumns.filter(col => col.pk > 0).sort((a, b) => a.pk - b.pk),
    [tableColumns]
  );

  const rowsWithMeta = useMemo<RowMeta[]>(() => {
    if (!data?.rows || !data.columns) {
      return [];
    }

    const rowIdIndex = columnIndexMap.get(INTERNAL_ROWID_COLUMN);

    return data.rows.map((row) => {
      const values: Record<string, unknown> = {};
      data.columns.forEach((col, idx) => {
        values[col] = row[idx];
      });

      const rawRowId = rowIdIndex !== undefined ? row[rowIdIndex] : undefined;
      const numericRowId =
        typeof rawRowId === 'number'
          ? rawRowId
          : typeof rawRowId === 'string'
            ? Number(rawRowId)
            : undefined;
      const rowIdValue = typeof numericRowId === 'number' && Number.isFinite(numericRowId) ? numericRowId : undefined;

      const primaryKeyValues: Record<string, unknown> = {};
      primaryKeyColumns.forEach((col) => {
        const idx = columnIndexMap.get(col.name);
        if (idx !== undefined) {
          primaryKeyValues[col.name] = row[idx];
        }
      });

      const identifier: RowIdentifier = {
        rowid: rowIdValue,
        primaryKeyValues: Object.keys(primaryKeyValues).length > 0 ? primaryKeyValues : undefined,
      };

      return {
        identifier,
        values,
        rowid: rowIdValue ?? null,
      };
    });
  }, [data, columnIndexMap, primaryKeyColumns]);

  const shouldDisableField = useCallback((column: ColumnInfo, value: unknown) => {
    const type = (column.type ?? '').toUpperCase();
    if (type.includes('BLOB')) return true;
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) return true;
    if (typeof value === 'string' && /^BLOB\(\d+ bytes\)/.test(value)) return true;
    return false;
  }, []);

  const formatValueForInput = useCallback((value: unknown) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }, []);

  const buildFormState = useCallback(
    (row: RowMeta | null): Record<string, FieldState> => {
      const nextState: Record<string, FieldState> = {};
      tableColumns.forEach((column) => {
        const columnValue = row?.values[column.name];
        const disabled = shouldDisableField(column, columnValue);
        const isNull = columnValue === null || columnValue === undefined;
        nextState[column.name] = {
          value: isNull ? '' : formatValueForInput(columnValue),
          isNull,
          disabled,
        };
      });
      return nextState;
    },
    [formatValueForInput, shouldDisableField, tableColumns]
  );

  const openEditorDialog = useCallback(
    (mode: 'create' | 'edit', row: RowMeta | null = null) => {
      setEditorMode(mode);
      setEditorRowMeta(row);
      setFormState(buildFormState(row));
      setEditorError(null);
      setEditorOpen(true);
    },
    [buildFormState]
  );

  const closeEditorDialog = useCallback(() => {
    setEditorOpen(false);
    setEditorRowMeta(null);
    setFormState({});
    setEditorError(null);
  }, []);

  const updateFieldValue = useCallback((columnName: string, value: string) => {
    setFormState((prev) => {
      const field = prev[columnName];
      if (!field) return prev;
      return {
        ...prev,
        [columnName]: {
          ...field,
          value,
          isNull: false,
        },
      };
    });
  }, []);

  const toggleFieldNull = useCallback((columnName: string, isNull: boolean) => {
    setFormState((prev) => {
      const field = prev[columnName];
      if (!field) return prev;
      return {
        ...prev,
        [columnName]: {
          ...field,
          isNull,
          value: isNull ? '' : field.value,
        },
      };
    });
  }, []);

  const coerceInputValue = useCallback((column: ColumnInfo, field: FieldState): unknown => {
    const type = (column.type ?? '').toUpperCase();
    const raw = field.value;

    if (field.isNull) {
      return null;
    }

    if (type.includes('INT') || type.includes('REAL') || type.includes('NUM') || type.includes('DEC') || type.includes('DOUBLE') || type.includes('FLOAT')) {
      if (raw.trim() === '') {
        return editorMode === 'create' ? undefined : null;
      }
      const num = Number(raw);
      if (Number.isNaN(num)) {
        throw new Error(`Invalid number for column ${column.name}`);
      }
      return num;
    }

    if (type.includes('BOOL')) {
      const lowered = raw.trim().toLowerCase();
      if (lowered === '' && editorMode === 'create') {
        return undefined;
      }
      if (lowered === '1' || lowered === 'true') return 1;
      if (lowered === '0' || lowered === 'false') return 0;
      if (lowered === '') return null;
      throw new Error(`Invalid boolean for column ${column.name}`);
    }

    if (raw === '' && editorMode === 'create') {
      return undefined;
    }

    return raw;
  }, [editorMode]);

  const handleEditorSubmit = useCallback(async () => {
    if (!tableName) {
      return;
    }

    setEditorError(null);
    setActionLoading(true);

    try {
      const payload: RowValueMap = {};

      tableColumns.forEach((column) => {
        const field = formState[column.name];
        if (!field || field.disabled) {
          return;
        }

        if (field.isNull) {
          payload[column.name] = null;
          return;
        }

        const coerced = coerceInputValue(column, field);
        if (coerced !== undefined) {
          payload[column.name] = coerced;
        }
      });

      if (editorMode === 'edit') {
        if (!editorRowMeta) {
          throw new Error('No row selected for editing');
        }

        if (Object.keys(payload).length === 0) {
          throw new Error('Update at least one column or mark a field as NULL.');
        }

        await clientDatabaseManager.updateRow(tableName, editorRowMeta.identifier, payload);
        setFeedback({ type: 'success', message: 'Row updated successfully.' });
        await fetchTableData(tableName, currentPage, searchTerm);
      } else {
        await clientDatabaseManager.insertRow(tableName, payload);
        setFeedback({ type: 'success', message: 'Row inserted successfully.' });
        await fetchTableData(tableName, 1, searchTerm);
      }

      closeEditorDialog();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Failed to save row.');
    } finally {
      setActionLoading(false);
    }
  }, [closeEditorDialog, coerceInputValue, currentPage, editorMode, editorRowMeta, fetchTableData, formState, searchTerm, tableColumns, tableName]);

  const handleDeleteRow = useCallback(async (row: RowMeta) => {
    if (!tableName) {
      return;
    }

    const confirmDelete = window.confirm('Delete this row? This action cannot be undone.');
    if (!confirmDelete) {
      return;
    }

    setActionLoading(true);
    setContextMenu(null);
    try {
      await clientDatabaseManager.deleteRow(tableName, row.identifier);
      setFeedback({ type: 'success', message: 'Row deleted successfully.' });
      const targetPage = rowsWithMeta.length <= 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      await fetchTableData(tableName, targetPage, searchTerm);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to delete row.' });
    } finally {
      setActionLoading(false);
    }
  }, [currentPage, fetchTableData, rowsWithMeta.length, searchTerm, tableName]);

  const startCellEdit = useCallback((rowIndex: number, columnName: string, currentValue: unknown) => {
    setEditingCell({ rowIndex, columnName });
    setEditValue(formatValueForInput(currentValue));
  }, [formatValueForInput]);

  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const saveCellEdit = useCallback(async () => {
    if (!editingCell || !tableName) {
      return;
    }

    const rowMeta = rowsWithMeta[editingCell.rowIndex];
    if (!rowMeta) {
      return;
    }

    const column = tableColumns.find(c => c.name === editingCell.columnName);
    if (!column) {
      return;
    }

    setActionLoading(true);
    try {
      const field: FieldState = {
        value: editValue,
        isNull: editValue === '',
        disabled: false,
      };

      const coercedValue = coerceInputValue(column, field);
      const payload: RowValueMap = {
        [editingCell.columnName]: coercedValue,
      };

      await clientDatabaseManager.updateRow(tableName, rowMeta.identifier, payload);
      setFeedback({ type: 'success', message: 'Cell updated successfully.' });
      await fetchTableData(tableName, currentPage, searchTerm);
      cancelCellEdit();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update cell.' });
    } finally {
      setActionLoading(false);
    }
  }, [cancelCellEdit, coerceInputValue, currentPage, editValue, editingCell, fetchTableData, rowsWithMeta, searchTerm, tableColumns, tableName]);

  const handleCellKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveCellEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelCellEdit();
    }
  }, [cancelCellEdit, saveCellEdit]);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
      setColumnHeaderContextMenu(null);
    };

    if (contextMenu || columnHeaderContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu, columnHeaderContextMenu]);

  const fetchDistinctValues = useCallback(async (columnName: string) => {
    if (!tableName) return;
    
    setLoadingDistinctValues(true);
    try {
      const safeTable = quoteIdentifier(tableName);
      const safeColumn = quoteIdentifier(columnName);
      
      // Fetch distinct values (limit to 1000 to prevent memory issues)
      const query = `SELECT DISTINCT ${safeColumn} FROM ${safeTable} ORDER BY ${safeColumn} LIMIT 1000`;
      const result = await clientDatabaseManager.executeQuery(query);
      
      const distinctValues: (string | number | null)[] = result.rows.map(row => row[0] as string | number | null);
      setColumnDistinctValues(distinctValues);
    } catch (error) {
      console.error('Error fetching distinct values:', error);
      setColumnDistinctValues([]);
    } finally {
      setLoadingDistinctValues(false);
    }
  }, [tableName, quoteIdentifier]);

  const openFilterDialog = useCallback((columnName: string) => {
    setFilteringColumn(columnName);
    setColumnHeaderContextMenu(null);
    
    // Check if there's an existing filter for this column
    const existingFilter = activeFilters.find(f => f.columnName === columnName);
    if (existingFilter) {
      setTempFilterOperator(existingFilter.operator);
      setTempFilterValues(new Set(existingFilter.values));
      setTempRangeStart(existingFilter.rangeStart?.toString() || '');
      setTempRangeEnd(existingFilter.rangeEnd?.toString() || '');
    } else {
      // Check if column is numeric to set default operator
      const column = tableColumns.find(c => c.name === columnName);
      const isNumeric = column && (column.type?.toUpperCase().includes('INT') || 
                                   column.type?.toUpperCase().includes('REAL') ||
                                   column.type?.toUpperCase().includes('NUM'));
      setTempFilterOperator(isNumeric ? 'gte' : 'in');
      setTempFilterValues(new Set());
      setTempRangeStart('');
      setTempRangeEnd('');
    }
    
    fetchDistinctValues(columnName);
    setFilterDialogOpen(true);
  }, [activeFilters, tableColumns, fetchDistinctValues]);

  const applyFilter = useCallback(() => {
    if (!filteringColumn) return;
    
    const newFilter: ColumnFilter = {
      columnName: filteringColumn,
      operator: tempFilterOperator,
      values: Array.from(tempFilterValues),
    };

    // Add range values for between operator
    if (tempFilterOperator === 'between') {
      const start = parseFloat(tempRangeStart);
      const end = parseFloat(tempRangeEnd);
      if (!isNaN(start) && !isNaN(end)) {
        newFilter.rangeStart = start;
        newFilter.rangeEnd = end;
      } else {
        alert('Please enter valid numbers for range');
        return;
      }
    } else if (['gt', 'gte', 'lt', 'lte'].includes(tempFilterOperator)) {
      const value = parseFloat(tempRangeStart);
      if (!isNaN(value)) {
        newFilter.values = [value];
      } else {
        alert('Please enter a valid number');
        return;
      }
    }

    // Validate filter has values (except for null checks)
    if (!['is_null', 'not_null'].includes(tempFilterOperator)) {
      if (tempFilterOperator === 'in' && tempFilterValues.size === 0) {
        alert('Please select at least one value');
        return;
      }
      if (['gt', 'gte', 'lt', 'lte'].includes(tempFilterOperator) && newFilter.values.length === 0) {
        alert('Please enter a value');
        return;
      }
    }

    // Remove existing filter for this column and add new one
    const updatedFilters = activeFilters.filter(f => f.columnName !== filteringColumn);
    updatedFilters.push(newFilter);
    
    setActiveFilters(updatedFilters);
    setFilterDialogOpen(false);
    setFilteringColumn(null);
    
    // Refresh data with new filter - pass the updated filters explicitly
    if (tableName) {
      fetchTableData(tableName, 1, searchTerm, updatedFilters);
    }
  }, [filteringColumn, tempFilterOperator, tempFilterValues, tempRangeStart, tempRangeEnd, activeFilters, tableName, searchTerm, fetchTableData]);

  const removeFilter = useCallback((columnName: string) => {
    const updatedFilters = activeFilters.filter(f => f.columnName !== columnName);
    setActiveFilters(updatedFilters);
    
    // Refresh data without the filter - pass the updated filters explicitly
    if (tableName) {
      fetchTableData(tableName, currentPage, searchTerm, updatedFilters);
    }
  }, [activeFilters, tableName, currentPage, searchTerm, fetchTableData]);

  const clearAllFilters = useCallback(() => {
    setActiveFilters([]);
    if (tableName) {
      fetchTableData(tableName, 1, searchTerm, []);
    }
  }, [tableName, searchTerm, fetchTableData]);

  const handleSearch = () => {
    if (tableName) {
      fetchTableData(tableName, 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      fetchTableData(tableName!, currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (data && data.totalCount && currentPage * itemsPerPage < data.totalCount) {
      fetchTableData(tableName!, currentPage + 1);
    }
  };

  const handleItemsPerPageChange = (value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      setItemsPerPage(numValue);
      if (tableName) {
        fetchTableData(tableName, 1);
      }
    }
  };

  const toggleColumnVisibility = (columnName: string) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnName)) {
        newSet.delete(columnName);
        // When hiding a column, also disable multiline for it
        setMultilineColumns(multilinePrev => {
          const newMultilineSet = new Set(multilinePrev);
          newMultilineSet.delete(columnName);
          return newMultilineSet;
        });
        // When hiding a column, also remove sticky setting if it's the sticky column
        if (stickyColumn === columnName) {
          setStickyColumn(null);
        }
      } else {
        newSet.add(columnName);
      }
      return newSet;
    });
  };

  const toggleColumnMultiline = (columnName: string) => {
    setMultilineColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnName)) {
        newSet.delete(columnName);
      } else {
        newSet.add(columnName);
      }
      return newSet;
    });
  };

  const toggleStickyColumn = (columnName: string) => {
    setStickyColumn(prev => {
      // If the same column is clicked, toggle it off
      if (prev === columnName) {
        return null;
      }
      // Otherwise, set this column as the sticky one
      return columnName;
    });
  };

  const handleColumnSort = (columnName: string) => {
    let newSortColumn: string | null = columnName;
    let newSortDirection: SortDirection = 'asc';
    
    if (sortColumn === columnName) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        newSortDirection = 'desc';
      } else if (sortDirection === 'desc') {
        newSortColumn = null;
        newSortDirection = null;
      }
    }
    
    setSortColumn(newSortColumn);
    setSortDirection(newSortDirection);
    
    // Refresh data with new sorting
    if (tableName) {
      fetchTableData(tableName, currentPage, searchTerm);
    }
  };

  const getSortIcon = (columnName: string) => {
    if (sortColumn !== columnName) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-4 w-4" />;
    }
    return <ArrowDown className="h-4 w-4" />;
  };

  const handleColumnResize = (columnName: string, newWidth: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnName]: Math.max(50, newWidth) // Minimum width of 50px
    }));
  };

  const ResizeHandle = ({ columnName }: { columnName: string }) => {
    const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const startX = e.clientX;
      const startWidth = columnWidths[columnName] || 200;
      
      const handleMouseMove = (e: MouseEvent) => {
        const diff = e.clientX - startX;
        const newWidth = startWidth + diff;
        handleColumnResize(columnName, newWidth);
      };
      
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.classList.remove('resizing');
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.classList.add('resizing');
    };
    
    return (
      <div
        className="table-resize-handle"
        onMouseDown={handleMouseDown}
      />
    );
  };

  const formatCellValue = (value: unknown, columnName: string, rowId?: number) => {
    if (value === null) {
      return <span className="text-muted-foreground italic">NULL</span>;
    }

    // BLOB placeholders - not supported in client-side mode
    // In a fully client-side app, BLOBs are loaded directly with the database
    if (typeof value === 'string' && /^BLOB\(\d+ bytes\)/.test(value)) {
      return null;
    }
    
    // Handle binary data (Uint8Array or ArrayBuffer) - often contains images
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
      const size = bytes.length;
      
      // Check if it might be an image by looking at common image headers
      const isImage = isLikelyImage(bytes);
      
      if (isImage && size > 0) {
        try {
          // Convert to base64 and create data URL
          const base64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
          const mimeType = getImageMimeType(bytes);
          const dataUrl = `data:${mimeType};base64,${base64}`;
          
          return (
            <div className="flex items-center gap-2">
              <img 
                src={dataUrl} 
                alt="Database image"
                className="w-16 h-16 object-cover rounded border cursor-pointer hover:opacity-80"
                onClick={() => {
                  // Open image in new tab for full view
                  const newWindow = window.open();
                  if (newWindow) {
                    newWindow.document.write(`<img src="${dataUrl}" style="max-width:100%;height:auto;" />`);
                  }
                }}
                title="Click to view full size"
              />
              <div className="text-xs text-muted-foreground">
                <div>Image ({formatBytes(size)})</div>
                <div>{mimeType}</div>
              </div>
            </div>
          );
        } catch (error) {
          console.warn('Failed to display image:', error);
        }
      }
      
      // For non-image binary data, show simple badge
      // Note: In client-side mode, BLOBs are loaded directly with the database
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">BINARY</Badge>
          <span className="text-xs text-muted-foreground">{formatBytes(size)}</span>
        </div>
      );
    }
    
    if (typeof value === 'string') {
      const isMultiline = multilineColumns.has(columnName);
      
      if (isMultiline) {
        // For multiline columns, show full content with preserved line breaks
        return (
          <div className="whitespace-pre-wrap max-w-lg break-words py-1 leading-relaxed">
            {value}
          </div>
        );
      } else if (value.length > 100) {
        // For single-line columns, truncate long text
        return (
          <span className="truncate block max-w-xs" title={value}>
            {value.substring(0, 100)}...
          </span>
        );
      }
      
      return value;
    }
    
    if (typeof value === 'boolean') {
      return (
        <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
          {value.toString()}
        </Badge>
      );
    }
    
    if (typeof value === 'number') {
      return (
        <span className="font-mono text-sm">
          {value.toLocaleString()}
        </span>
      );
    }
    
    return value?.toString() || '';
  };

  // Helper function to detect if binary data is likely an image
  const isLikelyImage = (bytes: Uint8Array): boolean => {
    if (bytes.length < 4) return false;
    
    // Check for common image file signatures
    const header = Array.from(bytes.slice(0, 4));
    
    // JPEG: FF D8 FF
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) return true;
    
    // PNG: 89 50 4E 47
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return true;
    
    // GIF: 47 49 46 38 or 47 49 46 39
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && (header[3] === 0x38 || header[3] === 0x39)) return true;
    
    // BMP: 42 4D
    if (header[0] === 0x42 && header[1] === 0x4D) return true;
    
    // WebP: check for "RIFF" and "WEBP" signatures
    if (bytes.length >= 12 && 
        header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return true;
    
    return false;
  };

  // Helper function to get MIME type from image header
  const getImageMimeType = (bytes: Uint8Array): string => {
    const header = Array.from(bytes.slice(0, 4));
    
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) return 'image/jpeg';
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return 'image/png';
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return 'image/gif';
    if (header[0] === 0x42 && header[1] === 0x4D) return 'image/bmp';
    if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
    
    return 'application/octet-stream';
  };

  // Helper function to format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Feedback banner */}
      {feedback && (
        <div className={`px-4 py-2 text-sm font-medium ${feedback.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
          <div className="flex items-center justify-between">
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="ml-4 underline">Dismiss</button>
          </div>
        </div>
      )}
      {/* Header row with table tabs, search, and column settings */}
      <div className="border-b border-border bg-card px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          {/* Tabs: switch tables inline like Supabase */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <TableTabs
              selectedDatabase={selectedDatabase}
              selectedTable={tableName}
              onTableSelect={onTableSelect}
            />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Add row button - opens form dialog */}
            {tableName && (
              <Button
                variant="default"
                size="sm"
                className="h-8"
                onClick={() => openEditorDialog('create', null)}
                disabled={actionLoading}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search in table..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9 w-64 h-8"
              />
            </div>
            
            {/* Column Settings */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Settings className="h-4 w-4 mr-2" />
                  Columns
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Column Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {data && data.columns ? (
                    <>
                      <div className="flex items-center justify-between pb-2 border-b">
                        <span className="text-sm text-muted-foreground">
                          {visibleColumns.size} of {displayColumns.length} columns visible
                        </span>
                        <div className="space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setVisibleColumns(new Set(displayColumns));
                              setStickyColumn(prev => prev ?? (displayColumns[0] ?? null));
                            }}
                          >
                            Show All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setVisibleColumns(new Set());
                              setStickyColumn(null); // Reset sticky column when hiding all
                            }}
                          >
                            Hide All
                          </Button>
                        </div>
                      </div>
                      {displayColumns.map((column) => (
                    <div key={column} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`column-${column}`}
                            checked={visibleColumns.has(column)}
                            onChange={() => toggleColumnVisibility(column)}
                            className="rounded border-border accent-primary"
                          />
                          <label 
                            htmlFor={`column-${column}`} 
                            className="text-sm font-medium leading-none"
                          >
                            {column}
                          </label>
                        </div>
                        {sortColumn === column && (
                          <Badge variant="secondary" className="text-xs">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 pl-6">
                        <input
                          type="checkbox"
                          id={`multiline-${column}`}
                          checked={multilineColumns.has(column)}
                          onChange={() => toggleColumnMultiline(column)}
                          disabled={!visibleColumns.has(column)}
                          className="rounded border-border accent-primary"
                        />
                        <label 
                          htmlFor={`multiline-${column}`} 
                          className={`text-xs leading-none ${
                            !visibleColumns.has(column) ? 'text-muted-foreground cursor-not-allowed' : 'text-foreground'
                          }`}
                        >
                          Allow multiline display
                        </label>
                      </div>
                      <div className="flex items-center space-x-2 pl-6">
                        <input
                          type="radio"
                          id={`sticky-${column}`}
                          name="sticky-column"
                          checked={stickyColumn === column}
                          onChange={() => toggleStickyColumn(column)}
                          disabled={!visibleColumns.has(column)}
                          className="rounded border-border accent-primary"
                        />
                        <label 
                          htmlFor={`sticky-${column}`} 
                          className={`text-xs leading-none ${
                            !visibleColumns.has(column) ? 'text-muted-foreground cursor-not-allowed' : 'text-foreground'
                          }`}
                        >
                          Pin column to left
                        </label>
                      </div>
                    </div>
                  ))}
                    </>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      <p className="text-sm">No data loaded</p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Active Filters Display */}
      {activeFilters.length > 0 && (
        <div className="border-b border-border bg-muted/50 px-4 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground">Active Filters:</span>
            {activeFilters.map((filter) => {
              let filterLabel = '';
              if (filter.operator === 'in' && filter.values.length > 0) {
                const displayValues = filter.values.slice(0, 3).map(v => v === null ? 'NULL' : String(v)).join(', ');
                filterLabel = filter.values.length > 3 ? `${displayValues}... (+${filter.values.length - 3})` : displayValues;
              } else if (filter.operator === 'equals') {
                filterLabel = `= ${filter.values[0] === null ? 'NULL' : filter.values[0]}`;
              } else if (filter.operator === 'gt') {
                filterLabel = `> ${filter.values[0]}`;
              } else if (filter.operator === 'gte') {
                filterLabel = `≥ ${filter.values[0]}`;
              } else if (filter.operator === 'lt') {
                filterLabel = `< ${filter.values[0]}`;
              } else if (filter.operator === 'lte') {
                filterLabel = `≤ ${filter.values[0]}`;
              } else if (filter.operator === 'between') {
                filterLabel = `${filter.rangeStart} - ${filter.rangeEnd}`;
              } else if (filter.operator === 'is_null') {
                filterLabel = 'IS NULL';
              } else if (filter.operator === 'not_null') {
                filterLabel = 'IS NOT NULL';
              }

              return (
                <Badge 
                  key={filter.columnName} 
                  variant="secondary" 
                  className="flex items-center gap-1 px-2 py-1"
                >
                  <span className="font-medium">{filter.columnName}:</span>
                  <span>{filterLabel}</span>
                  <button
                    onClick={() => removeFilter(filter.columnName)}
                    className="ml-1 hover:bg-background rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs"
              onClick={clearAllFilters}
            >
              Clear All
            </Button>
          </div>
        </div>
      )}

      {/* Table Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!tableName ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <RowsIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-medium">No table selected</h3>
                <p className="text-sm text-muted-foreground">
                  Choose a table from the tabs above to view its data
                </p>
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : data && data.columns && data.rows ? (
          <>
            {/* Table with sticky header and footer */}
            <div className="flex-1 scrollable-table-container">
              <div className="scrollable-table-wrapper">
                <table className="supabase-table text-sm scrollable-table" style={{ tableLayout: 'auto' }}>
                  <thead>
                    <tr>
                      {displayColumns
                        .filter(col => visibleColumns.has(col))
                        .map((col) => {
                          const hasFilter = activeFilters.some(f => f.columnName === col);
                          return (
                            <th 
                              key={col} 
                              className={`cursor-pointer select-none hover:bg-table-row-hover transition-colors px-4 py-3 text-left border-r border-border relative ${
                                sortColumn === col ? 'bg-primary/10 text-primary' : ''
                              } ${
                                hasFilter ? 'bg-blue-50 dark:bg-blue-950' : ''
                              } ${
                                stickyColumn === col ? 'sticky-column-header' : ''
                              }`}
                              style={{ 
                                maxWidth: `${columnWidths[col] || 200}px`
                              }}
                              onClick={() => handleColumnSort(col)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setColumnHeaderContextMenu({ x: e.clientX, y: e.clientY, columnName: col });
                              }}
                            >
                              <div className="flex items-center gap-2 font-medium pr-2">
                                {col}
                                {multilineColumns.has(col) && (
                                  <Badge variant="outline" className="text-xs">
                                    ML
                                  </Badge>
                                )}
                                {stickyColumn === col && (
                                  <Badge variant="secondary" className="text-xs">
                                    PINNED
                                  </Badge>
                                )}
                                {hasFilter && (
                                  <Badge variant="default" className="text-xs bg-blue-500">
                                    <Filter className="h-3 w-3" />
                                  </Badge>
                                )}
                                {getSortIcon(col)}
                              </div>
                              <ResizeHandle columnName={col} />
                            </th>
                          );
                        })}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsWithMeta.map((rowMeta, rowIndex) => (
                      <tr 
                        key={rowIndex} 
                        className="hover:bg-table-row-hover transition-colors"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, rowMeta });
                        }}
                      >
                        {displayColumns
                          ?.filter(col => visibleColumns.has(col))
                          ?.map((col) => {
                            const colIndex = columnIndexMap.get(col);
                            const cellValue = colIndex !== undefined ? data?.rows[rowIndex]?.[colIndex] : undefined;
                            const isBlobPlaceholder = typeof cellValue === 'string' && /^BLOB\(\d+ bytes\)/.test(cellValue as string);
                            const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.columnName === col;
                            const column = tableColumns.find(c => c.name === col);
                            const isDisabled = column ? shouldDisableField(column, cellValue) : true;
                            
                            return (
                              <td 
                                key={col} 
                                className={`px-4 py-2 border-r border-border ${
                                  multilineColumns.has(col) ? "align-top" : ""
                                } ${
                                  stickyColumn === col ? 'sticky-column-cell' : ''
                                } ${
                                  isEditing ? 'bg-primary/5' : ''
                                } ${
                                  !isDisabled ? 'cursor-text hover:bg-muted/50' : ''
                                }`}
                                style={{ 
                                  maxWidth: `${columnWidths[col] || 200}px`
                                }}
                                onDoubleClick={() => {
                                  if (!isDisabled && !actionLoading) {
                                    startCellEdit(rowIndex, col, cellValue);
                                  }
                                }}
                              >
                                {isEditing ? (
                                  <Input
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={handleCellKeyDown}
                                    onBlur={saveCellEdit}
                                    autoFocus
                                    className="h-7 px-2 py-1 text-sm -mx-2"
                                  />
                                ) : (
                                  <div
                                    className={
                                      isBlobPlaceholder
                                          ? 'whitespace-normal break-words'
                                        : (multilineColumns.has(col)
                                            ? 'whitespace-pre-wrap break-words'
                                            : 'overflow-hidden whitespace-nowrap text-ellipsis')
                                    }
                                    style={isBlobPlaceholder
                                      ? { maxWidth: '100%' }
                                      : (multilineColumns.has(col)
                                          ? { maxWidth: '100%' }
                                          : { textOverflow: 'ellipsis', maxWidth: '100%' })}
                                    title={!multilineColumns.has(col) && !isBlobPlaceholder ? String(cellValue) : undefined}
                                  >
                                    {formatCellValue(cellValue, col, rowMeta.rowid ?? undefined)}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Sticky Pagination Footer */}
                <div className="table-footer-sticky">
                  <div className="table-footer-content px-4 py-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Rows per page:</span>
                          <Input
                            type="number"
                            min="1"
                            value={itemsPerPage}
                            onChange={(e) => handleItemsPerPageChange(e.target.value)}
                            className="w-16 h-8"
                          />
                        </div>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          Showing {Math.min((currentPage - 1) * itemsPerPage + 1, data?.totalCount ?? 0)} to{' '}
                          {Math.min(currentPage * itemsPerPage, data?.totalCount ?? 0)} of{' '}
                          {data?.totalCount?.toLocaleString() ?? 0} results
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          Page {currentPage} of {Math.ceil((data?.totalCount ?? 0) / itemsPerPage)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            onClick={handlePreviousPage}
                            disabled={currentPage === 1}
                            variant="outline"
                            size="sm"
                            className="h-8"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </Button>
                          <Button
                            onClick={handleNextPage}
                            disabled={!data || currentPage * itemsPerPage >= (data.totalCount ?? 0)}
                            variant="outline"
                            size="sm"
                            className="h-8"
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <RowsIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-medium">No data available</h3>
                <p className="text-sm text-muted-foreground">
                  No data found for this table
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Row Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-x-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editorMode === 'create' ? 'Add New Row' : 'View / Edit Row'}
            </DialogTitle>
          </DialogHeader>
          {editorError && (
            <div className="px-3 py-2 text-sm bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded">
              {editorError}
            </div>
          )}
          <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-3 pr-2">
            {tableColumns.map((column) => {
              const field = formState[column.name];
              if (!field) return null;

              const value = editorRowMeta?.values[column.name];
              const isMultiline = (column.type?.toUpperCase() ?? '').includes('TEXT') && field.value.length > 50;

              return (
                <div key={column.name} className="border border-border bg-card rounded-lg p-4 space-y-3 min-w-0">
                  <div className="flex items-start justify-between gap-4 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <label className="text-sm font-semibold text-foreground break-words min-w-0">{column.name}</label>
                        {column.pk > 0 && <Badge variant="secondary" className="text-xs flex-shrink-0">PK</Badge>}
                        {column.notnull > 0 && <Badge variant="outline" className="text-xs flex-shrink-0">NOT NULL</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground break-words">{column.type || 'UNKNOWN'}</p>
                    </div>
                    {!field.disabled && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <input
                          type="checkbox"
                          id={`null-${column.name}`}
                          checked={field.isNull}
                          onChange={(e) => toggleFieldNull(column.name, e.target.checked)}
                          className="rounded border-border"
                        />
                        <label htmlFor={`null-${column.name}`} className="text-xs text-foreground cursor-pointer whitespace-nowrap">
                          Set NULL
                        </label>
                      </div>
                    )}
                  </div>
                  
                  <div className="min-w-0 overflow-hidden">
                    {field.disabled ? (
                      <div className="space-y-2 min-w-0">
                        <div className="px-3 py-2 bg-muted/50 text-foreground text-sm rounded border border-border">
                          BLOB data cannot be edited here
                        </div>
                        {value instanceof Uint8Array || value instanceof ArrayBuffer ? (
                          <div className="space-y-2 min-w-0">
                            <div className="flex items-center gap-2 text-sm text-foreground flex-wrap">
                              <Badge variant="outline">BINARY DATA</Badge>
                              <span>{formatBytes(value instanceof ArrayBuffer ? value.byteLength : value.length)}</span>
                            </div>
                            {isLikelyImage(value instanceof ArrayBuffer ? new Uint8Array(value) : value) && (
                              <div className="mt-2 min-w-0">
                                {(() => {
                                  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
                                  const base64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
                                  const mimeType = getImageMimeType(bytes);
                                  const dataUrl = `data:${mimeType};base64,${base64}`;
                                  return (
                                    <img 
                                      src={dataUrl} 
                                      alt={`${column.name} preview`}
                                      className="max-w-full max-h-96 object-contain rounded border cursor-pointer hover:opacity-90"
                                      onClick={() => {
                                        const newWindow = window.open();
                                        if (newWindow) {
                                          newWindow.document.write(`
                                            <html>
                                              <head><title>${column.name}</title></head>
                                              <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000;">
                                                <img src="${dataUrl}" style="max-width:100%;height:auto;" />
                                              </body>
                                            </html>
                                          `);
                                        }
                                      }}
                                      title="Click to view full size in new window"
                                    />
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : isMultiline ? (
                      <Textarea
                        value={field.value}
                        onChange={(e) => updateFieldValue(column.name, e.target.value)}
                        disabled={field.isNull}
                        className="min-h-[100px] font-mono text-sm w-full bg-background text-foreground"
                        placeholder={field.isNull ? 'NULL' : `Enter ${column.name}...`}
                      />
                    ) : (
                      <Input
                        type="text"
                        value={field.value}
                        onChange={(e) => updateFieldValue(column.name, e.target.value)}
                        disabled={field.isNull}
                        className="font-mono text-sm w-full bg-background text-foreground"
                        placeholder={field.isNull ? 'NULL' : `Enter ${column.name}...`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
            <Button variant="outline" onClick={closeEditorDialog} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={handleEditorSubmit} disabled={actionLoading}>
              {actionLoading ? 'Saving...' : editorMode === 'create' ? 'Create Row' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Right-click Context Menu for Rows */}
      {contextMenu && (
        <div
          className="fixed bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
            onClick={() => {
              openEditorDialog('edit', contextMenu.rowMeta);
              setContextMenu(null);
            }}
          >
            <Search className="h-4 w-4" />
            View / Edit Row
          </button>
          <div className="border-t border-border my-1"></div>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 text-destructive"
            onClick={() => handleDeleteRow(contextMenu.rowMeta)}
            disabled={actionLoading}
          >
            <Trash2 className="h-4 w-4" />
            Delete Row
          </button>
        </div>
      )}

      {/* Right-click Context Menu for Column Headers */}
      {columnHeaderContextMenu && (
        <div
          className="fixed bg-popover border border-border rounded-md shadow-lg py-1 z-50 min-w-[180px]"
          style={{ top: columnHeaderContextMenu.y, left: columnHeaderContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
            onClick={() => openFilterDialog(columnHeaderContextMenu.columnName)}
          >
            <Filter className="h-4 w-4" />
            Filter Column
          </button>
          {activeFilters.some(f => f.columnName === columnHeaderContextMenu.columnName) && (
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 text-destructive"
              onClick={() => {
                removeFilter(columnHeaderContextMenu.columnName);
                setColumnHeaderContextMenu(null);
              }}
            >
              <X className="h-4 w-4" />
              Remove Filter
            </button>
          )}
        </div>
      )}

      {/* Filter Dialog */}
      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Filter Column: {filteringColumn}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Filter Operator Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Filter Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(() => {
                  const column = tableColumns.find(c => c.name === filteringColumn);
                  const isNumeric = column && (
                    column.type?.toUpperCase().includes('INT') || 
                    column.type?.toUpperCase().includes('REAL') ||
                    column.type?.toUpperCase().includes('NUM') ||
                    column.type?.toUpperCase().includes('FLOAT') ||
                    column.type?.toUpperCase().includes('DOUBLE')
                  );

                  const operators: { value: FilterOperator; label: string }[] = [
                    { value: 'in', label: 'Select Values' },
                    { value: 'is_null', label: 'Is NULL' },
                    { value: 'not_null', label: 'Is Not NULL' },
                  ];

                  if (isNumeric) {
                    operators.push(
                      { value: 'gt', label: 'Greater Than' },
                      { value: 'gte', label: 'Greater or Equal' },
                      { value: 'lt', label: 'Less Than' },
                      { value: 'lte', label: 'Less or Equal' },
                      { value: 'between', label: 'Between Range' }
                    );
                  }

                  return operators.map(op => (
                    <Button
                      key={op.value}
                      variant={tempFilterOperator === op.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTempFilterOperator(op.value)}
                      className="justify-start"
                    >
                      {op.label}
                    </Button>
                  ));
                })()}
              </div>
            </div>

            {/* Filter Value Selection based on operator */}
            {tempFilterOperator === 'in' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Select Values {loadingDistinctValues && <span className="text-muted-foreground">(Loading...)</span>}
                </label>
                <div className="border border-border rounded-md max-h-80 overflow-y-auto p-2 space-y-1">
                  {loadingDistinctValues ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                  ) : columnDistinctValues.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No values found
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2 pb-2 border-b mb-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setTempFilterValues(new Set(columnDistinctValues))}
                        >
                          Select All
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setTempFilterValues(new Set())}
                        >
                          Clear
                        </Button>
                        <span className="text-sm text-muted-foreground self-center ml-auto">
                          {tempFilterValues.size} selected
                        </span>
                      </div>
                      {columnDistinctValues.map((value, idx) => (
                        <div key={idx} className="flex items-center space-x-2 p-1 hover:bg-muted rounded">
                          <input
                            type="checkbox"
                            id={`filter-value-${idx}`}
                            checked={tempFilterValues.has(value)}
                            onChange={(e) => {
                              const newSet = new Set(tempFilterValues);
                              if (e.target.checked) {
                                newSet.add(value);
                              } else {
                                newSet.delete(value);
                              }
                              setTempFilterValues(newSet);
                            }}
                            className="rounded border-border accent-primary"
                          />
                          <label 
                            htmlFor={`filter-value-${idx}`} 
                            className="text-sm flex-1 cursor-pointer"
                          >
                            {value === null ? <span className="italic text-muted-foreground">NULL</span> : String(value)}
                          </label>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {['gt', 'gte', 'lt', 'lte'].includes(tempFilterOperator) && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Enter Value</label>
                <Input
                  type="number"
                  value={tempRangeStart}
                  onChange={(e) => setTempRangeStart(e.target.value)}
                  placeholder="Enter number"
                  className="w-full"
                />
              </div>
            )}

            {tempFilterOperator === 'between' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Range</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={tempRangeStart}
                    onChange={(e) => setTempRangeStart(e.target.value)}
                    placeholder="Min"
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="number"
                    value={tempRangeEnd}
                    onChange={(e) => setTempRangeEnd(e.target.value)}
                    placeholder="Max"
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            {['is_null', 'not_null'].includes(tempFilterOperator) && (
              <div className="text-sm text-muted-foreground p-4 bg-muted rounded">
                This filter will show rows where <span className="font-medium">{filteringColumn}</span> is {tempFilterOperator === 'is_null' ? 'NULL' : 'NOT NULL'}.
              </div>
            )}

            {columnDistinctValues.length >= 1000 && tempFilterOperator === 'in' && (
              <div className="text-xs text-yellow-600 dark:text-yellow-500 p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                Note: Only the first 1,000 distinct values are shown. Some values may not appear in this list.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => {
                setFilterDialogOpen(false);
                setFilteringColumn(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={applyFilter}>
              Apply Filter
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}