'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, Table, Columns, Hash } from 'lucide-react';
import { clientDatabaseManager, TableInfo, ColumnInfo } from '@/lib/client-database';



interface SchemaInspectorProps {
  onTableSelect: (tableName: string) => void;
  selectedTable: string | null;
}

export function SchemaInspector({ onTableSelect, selectedTable }: SchemaInspectorProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [columnsLoading, setColumnsLoading] = useState(false);

  useEffect(() => {
    fetchTables();
  }, []);

  useEffect(() => {
    if (selectedTable) {
      fetchColumns(selectedTable);
    }
  }, [selectedTable]);

  const fetchTables = async () => {
    try {
      const tables = await clientDatabaseManager.getTables();
      setTables(tables);
    } catch (error) {
      console.error('Error fetching tables:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchColumns = async (tableName: string) => {
    setColumnsLoading(true);
    try {
      const columns = await clientDatabaseManager.getTableColumns(tableName);
      setColumns(columns);
    } catch (error) {
      console.error('Error fetching columns:', error);
    } finally {
      setColumnsLoading(false);
    }
  };

  const getTypeColor = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('int') || lowerType.includes('id')) return 'bg-blue-100 text-blue-800';
    if (lowerType.includes('text') || lowerType.includes('varchar')) return 'bg-green-100 text-green-800';
    if (lowerType.includes('real') || lowerType.includes('float')) return 'bg-yellow-100 text-yellow-800';
    if (lowerType.includes('date') || lowerType.includes('time')) return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tables List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Tables
            <Badge variant="secondary">{tables.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {tables.map((table) => (
              <Button
                key={table.name}
                variant={selectedTable === table.name ? "default" : "ghost"}
                className="justify-start"
                onClick={() => onTableSelect(table.name)}
              >
                <Table className="h-4 w-4 mr-2" />
                {table.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Selected Table Columns */}
      {selectedTable && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Columns className="h-5 w-5" />
              {selectedTable} Columns
              {!columnsLoading && <Badge variant="secondary">{columns.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {columnsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <div className="space-y-3">
                {columns.map((column) => (
                  <div key={column.cid} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {column.pk ? (
                        <Hash className="h-4 w-4 text-amber-600" />
                      ) : (
                        <div className="h-4 w-4" />
                      )}
                      <div>
                        <div className="font-medium">{column.name}</div>
                        {column.dflt_value != null && (
                          <div className="text-sm text-gray-500">
                            Default: {String(column.dflt_value)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getTypeColor(column.type)}>
                        {column.type}
                      </Badge>
                      {column.notnull === 1 && (
                        <Badge variant="outline" className="text-xs">
                          NOT NULL
                        </Badge>
                      )}
                      {column.pk === 1 && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">
                          PRIMARY KEY
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}