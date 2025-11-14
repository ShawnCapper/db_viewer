'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Hash, Columns, ChevronDown } from 'lucide-react';
import { clientDatabaseManager, ColumnInfo } from '@/lib/client-database';

interface TableSchemaProps {
  tableName: string | null;
  compact?: boolean;
  collapsible?: boolean;
  initialCollapsed?: boolean;
}

export function TableSchema({ 
  tableName, 
  compact = false, 
  collapsible = false, 
  initialCollapsed = false 
}: TableSchemaProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    if (tableName) {
      fetchColumns(tableName);
    } else {
      setColumns([]);
    }
  }, [tableName]);

  const fetchColumns = async (tableName: string) => {
    setLoading(true);
    try {
      const columns = await clientDatabaseManager.getTableColumns(tableName);
      setColumns(columns);
    } catch (error) {
      console.error('Error fetching columns:', error);
      setColumns([]);
    } finally {
      setLoading(false);
    }
  };

  const getTypeColor = (type?: string) => {
    const lowerType = (type ?? '').toString().toLowerCase();
    if (lowerType.includes('int') || lowerType.includes('id')) return 'bg-blue-950/40 text-blue-300 border border-blue-800';
    if (lowerType.includes('text') || lowerType.includes('varchar')) return 'bg-green-950/40 text-green-300 border border-green-800';
    if (lowerType.includes('real') || lowerType.includes('float')) return 'bg-yellow-950/40 text-yellow-300 border border-yellow-800';
    if (lowerType.includes('date') || lowerType.includes('time')) return 'bg-purple-950/40 text-purple-300 border border-purple-800';
    return 'bg-gray-800/40 text-gray-300 border border-gray-700';
  };

  if (!tableName) return null;

  const header = (
    <div className="flex items-center justify-between mb-2">
      {collapsible ? (
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sidebar-muted hover:text-sidebar-foreground transition-colors"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
          SCHEMA
          {!loading && columns.length > 0 && (
            <Badge variant="secondary" className="text-xs ml-1">
              {columns.length}
            </Badge>
          )}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <Columns className="h-4 w-4 text-sidebar-muted" />
          <span className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
            SCHEMA
          </span>
          {!loading && columns.length > 0 && (
            <Badge variant="secondary" className="text-xs ml-1">
              {columns.length}
            </Badge>
          )}
        </div>
      )}
    </div>
  );

  const content = (
    <div className="space-y-1.5">
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sidebar-primary"></div>
        </div>
      ) : columns.length === 0 ? (
        <div className="text-sm text-sidebar-muted py-2 px-2">
          No columns found
        </div>
      ) : (
        columns.map((column, idx) => (
          <div key={`${column.cid}-${column.name}-${idx}`} className={`flex items-center justify-between ${compact ? 'py-1.5 px-2' : 'p-2'} border border-sidebar-border rounded-md bg-sidebar-accent/50 hover:bg-sidebar-accent transition-colors`}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {column.pk ? (
                <Hash className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
              ) : (
                <div className="h-3.5 w-3.5 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className={`${compact ? 'text-xs' : 'text-sm'} font-medium truncate text-sidebar-foreground`}>
                  {column.name}
                </div>
                {!compact && column.dflt_value != null && (
                  <div className="text-xs text-sidebar-muted truncate">
                    Default: {String(column.dflt_value)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Badge className={`${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'} ${getTypeColor(column.type)}`}>
                {column.type ?? 'UNKNOWN'}
              </Badge>
              {column.notnull === 1 && (
                <Badge variant="outline" className={`${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'} border-sidebar-border`}>
                  NN
                </Badge>
              )}
              {column.pk === 1 && (
                <Badge variant="outline" className={`${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'} bg-amber-950/30 text-amber-400 border-amber-800`}>
                  PK
                </Badge>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {header}
      {(!collapsible || !isCollapsed) && content}
    </div>
  );
}