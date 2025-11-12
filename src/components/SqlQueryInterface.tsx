'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Play, Database, AlertCircle, CheckCircle } from 'lucide-react';
import { clientDatabaseManager, QueryResult } from '@/lib/client-database';



interface QueryError {
  error: string;
  details?: string;
}

export function SqlQueryInterface() {
  const [query, setQuery] = useState('SELECT * FROM sqlite_master WHERE type="table";');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<QueryError | null>(null);
  const [loading, setLoading] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  const executeQuery = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setExecutionTime(null);

    const startTime = Date.now();

    try {
      const data = await clientDatabaseManager.executeQuery(query);
      const endTime = Date.now();
      setExecutionTime(endTime - startTime);
      setResult(data);
    } catch (err) {
      setError({
        error: 'Query execution failed',
        details: err instanceof Error ? err.message : 'Unknown error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCellValue = (value: unknown) => {
    if (value === null) return <span className="text-gray-400 italic">NULL</span>;
    if (typeof value === 'string' && value.length > 200) {
      return (
        <span className="truncate block max-w-sm" title={value}>
          {value.substring(0, 200)}...
        </span>
      );
    }
    if (typeof value === 'boolean') {
      return (
        <Badge variant={value ? 'default' : 'secondary'}>
          {value.toString()}
        </Badge>
      );
    }
    return String(value ?? '');
  };

  const sampleQueries = [
    'SELECT * FROM sqlite_master WHERE type="table";',
    'SELECT name FROM sqlite_master WHERE type="table";',
    'SELECT COUNT(*) as total_tables FROM sqlite_master WHERE type="table";',
  ];

  return (
    <div className="space-y-6">
      {/* Query Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            SQL Query Editor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Query</label>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter your SQL query here..."
              className="min-h-32 font-mono text-sm"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace' }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Note: Only SELECT queries are allowed for security
            </div>
            <Button
              onClick={executeQuery}
              disabled={loading || !query.trim()}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              {loading ? 'Executing...' : 'Execute Query'}
            </Button>
          </div>

          {/* Sample Queries */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Sample Queries</label>
            <div className="flex flex-wrap gap-2">
              {sampleQueries.map((sampleQuery, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => setQuery(sampleQuery)}
                  className="text-xs"
                >
                  {sampleQuery.length > 50
                    ? `${sampleQuery.substring(0, 50)}...`
                    : sampleQuery
                  }
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
              <span>Executing query...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              Query Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-red-700 font-medium">{error.error}</p>
              {error.details && (
                <p className="text-red-600 text-sm">{error.details}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                Query Results
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Badge variant="secondary">
                  {result.rowCount} rows
                </Badge>
                {executionTime && (
                  <Badge variant="outline">
                    {executionTime}ms
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.rowCount > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        {result.columns.map((column) => (
                          <TableHead key={column} className="font-semibold text-gray-900">
                            {column}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rows.map((row, index) => (
                        <TableRow key={index} className="hover:bg-gray-50">
                          {result.columns.map((column) => (
                            <TableCell key={column} className="max-w-sm">
                              {formatCellValue(row[column as keyof typeof row])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                Query executed successfully but returned no rows
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}