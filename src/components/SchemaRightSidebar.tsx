'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Key, Database, Type, Hash, Calendar, Text, ToggleLeft } from 'lucide-react';
import { clientDatabaseManager, ColumnInfo } from '@/lib/client-database';



interface SchemaRightSidebarProps {
  tableName: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SchemaRightSidebar({ tableName, isOpen, onClose }: SchemaRightSidebarProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableInfo, setTableInfo] = useState<{
    rowCount: number;
    size?: string;
  } | null>(null);

  useEffect(() => {
    if (tableName && isOpen) {
      fetchTableSchema();
      fetchTableInfo();
    }
  }, [tableName, isOpen]);

  const fetchTableSchema = async () => {
    if (!tableName) return;
    
    setLoading(true);
    try {
      const columns = await clientDatabaseManager.getTableColumns(tableName);
      setColumns(columns);
    } catch (error) {
      console.error('Error fetching table schema:', error);
      setColumns([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTableInfo = async () => {
    if (!tableName) return;
    
    try {
      const data = await clientDatabaseManager.getTableData(tableName, 1, 0);
      setTableInfo({
        rowCount: data.totalCount || 0,
      });
    } catch (error) {
      console.error('Error fetching table info:', error);
    }
  };

  const getTypeIcon = (type: string) => {
    const upperType = type.toUpperCase();
    if (upperType.includes('INT') || upperType.includes('NUMERIC') || upperType.includes('DECIMAL')) {
      return <Hash className="h-4 w-4 text-blue-500" />;
    }
    if (upperType.includes('TEXT') || upperType.includes('VARCHAR') || upperType.includes('CHAR')) {
      return <Text className="h-4 w-4 text-green-500" />;
    }
    if (upperType.includes('DATE') || upperType.includes('TIME')) {
      return <Calendar className="h-4 w-4 text-purple-500" />;
    }
    if (upperType.includes('BOOL')) {
      return <ToggleLeft className="h-4 w-4 text-orange-500" />;
    }
    return <Type className="h-4 w-4 text-gray-500" />;
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Table Schema</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {tableName && (
          <div className="mt-2 flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{tableName}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : !tableName ? (
          <div className="p-4 text-center text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select a table to view its schema</p>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Table Info */}
            {tableInfo && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Table Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Rows:</span>
                    <span className="font-medium">{tableInfo.rowCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Columns:</span>
                    <span className="font-medium">{columns.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Indexes:</span>
                    <span className="font-medium">{columns.filter(col => col.pk).length}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Columns */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Type className="h-4 w-4" />
                Columns ({columns.length})
              </h4>
              
              <div className="space-y-2">
                {columns.map((column) => (
                  <Card key={column.name} className="p-3">
                    <div className="space-y-2">
                      {/* Column name and type */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(column.type)}
                          <span className="font-medium text-sm">{column.name}</span>
                          {column.pk > 0 && (
                            <div title="Primary Key">
                              <Key className="h-3 w-3 text-yellow-500" />
                            </div>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {column.type}
                        </Badge>
                      </div>
                      
                      {/* Column properties */}
                      <div className="flex flex-wrap gap-1">
                        {column.pk > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            Primary Key
                          </Badge>
                        )}
                        {column.notnull === 0 && (
                          <Badge variant="outline" className="text-xs">
                            Nullable
                          </Badge>
                        )}
                        {column.notnull > 0 && column.pk === 0 && (
                          <Badge variant="outline" className="text-xs">
                            Not Null
                          </Badge>
                        )}
                        {column.dflt_value != null && (
                          <Badge variant="outline" className="text-xs">
                            Default: {String(column.dflt_value)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}