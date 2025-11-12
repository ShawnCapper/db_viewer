'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Upload, Database, X, FileCheck, AlertCircle, Loader2 } from 'lucide-react';
import { clientDatabaseManager } from '@/lib/client-database';
import { StorageInfo } from './StorageInfo';

interface DatabaseFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  isActive: boolean;
}

interface DatabaseUploaderProps {
  onDatabaseSelect: (databaseId: string) => void;
  selectedDatabase: string | null;
}

export function DatabaseUploader({ onDatabaseSelect, selectedDatabase }: DatabaseUploaderProps) {
  const [databases, setDatabases] = useState<DatabaseFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [, forceUpdate] = useState({});

  // Force component re-render
  const triggerUpdate = () => forceUpdate({});

  // Load databases on component mount
  useEffect(() => {
    loadDatabases();
    // Initialize the database manager
    clientDatabaseManager.initialize().then(loadDatabases).catch(console.error);
  }, []);

  const loadDatabases = () => {
    try {
      const dbInfos = clientDatabaseManager.getDatabases();
      const dbFiles: DatabaseFile[] = dbInfos.map(info => ({
        id: info.id,
        name: info.name,
        size: info.size,
        uploadedAt: info.uploadedAt,
        isActive: info.id === selectedDatabase
      }));
      setDatabases(dbFiles);
    } catch (error) {
      console.error('Error loading databases:', error);
    }
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.db') && !file.name.toLowerCase().endsWith('.sqlite') && !file.name.toLowerCase().endsWith('.sqlite3')) {
      setError('Please select a valid SQLite database file (.db, .sqlite, or .sqlite3)');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Check if file is too large and provide preview/options
      const preview = await clientDatabaseManager.createDatabasePreview(file);
      
      if (!preview.canLoad && !clientDatabaseManager.getAllowLargeFiles()) {
        const shouldTryAnyway = confirm(
          `${preview.reason}\n\nFile: ${file.name} (${preview.size})\n\n${preview.suggestion}\n\nWould you like to try loading it anyway? (This may cause browser crashes or freezing)`
        );
        
        if (shouldTryAnyway) {
          clientDatabaseManager.setAllowLargeFiles(true);
          clientDatabaseManager.setMemoryOptimizations(true);
          clientDatabaseManager.setMaxQueryResultRows(500); // Limit results for large files
        } else {
          setError(`File too large: ${preview.size}. ${preview.suggestion}`);
          return;
        }
      }

      // Attempt to load database
      let databaseId: string;
      if (file.size > 200 * 1024 * 1024) { // 200MB+
        databaseId = await clientDatabaseManager.loadLargeDatabase(file);
        setSuccess(`Large database "${file.name}" loaded with memory optimizations. Query results will be limited for performance.`);
      } else {
        databaseId = await clientDatabaseManager.loadDatabase(file);
        setSuccess(`Database "${file.name}" loaded successfully!`);
      }
      
      loadDatabases();
      // Auto-select the newly loaded database
      onDatabaseSelect(databaseId);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load database. Please try again.');
      console.error('Load error:', error);
    } finally {
      setLoading(false);
      // Reset the input
      event.target.value = '';
    }
  }, [onDatabaseSelect]);

  const handleDatabaseSelect = (databaseId: string) => {
    onDatabaseSelect(databaseId);
  };

  const handleDeleteDatabase = async (databaseId: string) => {
    if (!confirm('Are you sure you want to remove this database? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      await clientDatabaseManager.removeDatabase(databaseId);
      loadDatabases();
      
      // If this was the selected database, clear the selection
      if (selectedDatabase === databaseId) {
        onDatabaseSelect('');
      }
      
      setSuccess('Database removed successfully');
    } catch (error) {
      setError('Failed to remove database. Please try again.');
      console.error('Delete error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Section */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
          <div className="text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <div className="mt-4">
              <label htmlFor="database-upload" className="cursor-pointer">
                <span className="mt-2 block text-sm font-medium text-gray-900">
                  Upload SQLite Database
                </span>
                <span className="mt-1 block text-sm text-gray-600">
                  Select a .db, .sqlite, or .sqlite3 file (recommended max 200MB)
                </span>
              </label>
              <Input
                id="database-upload"
                type="file"
                accept=".db,.sqlite,.sqlite3"
                onChange={handleFileUpload}
                disabled={loading}
                className="mt-4"
              />
            </div>
            {loading && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-gray-600">Loading database...</span>
              </div>
            )}
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg">
            <FileCheck className="h-4 w-4" />
            <span>{success}</span>
          </div>
        )}

        {/* Large File Settings */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Large File Settings</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-700">Allow Large Files</span>
                <p className="text-xs text-gray-500">Enable loading files larger than 200MB (may cause crashes)</p>
              </div>
              <Button
                variant={clientDatabaseManager.getAllowLargeFiles() ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const newState = !clientDatabaseManager.getAllowLargeFiles();
                  clientDatabaseManager.setAllowLargeFiles(newState);
                  if (newState) {
                    clientDatabaseManager.setMemoryOptimizations(true);
                    clientDatabaseManager.setMaxQueryResultRows(500);
                  }
                  triggerUpdate();
                }}
              >
                {clientDatabaseManager.getAllowLargeFiles() ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-700">Memory Optimizations</span>
                <p className="text-xs text-gray-500">Limit query results to prevent browser crashes</p>
              </div>
              <Button
                variant={clientDatabaseManager.getMemoryOptimizations() ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  clientDatabaseManager.setMemoryOptimizations(!clientDatabaseManager.getMemoryOptimizations());
                  triggerUpdate();
                }}
              >
                {clientDatabaseManager.getMemoryOptimizations() ? 'On' : 'Off'}
              </Button>
            </div>
            {clientDatabaseManager.getMemoryOptimizations() && (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-700">Max Result Rows</span>
                  <p className="text-xs text-gray-500">Maximum rows returned per query</p>
                </div>
                <select
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                  value={clientDatabaseManager.getMaxQueryResultRows()}
                  onChange={(e) => {
                    clientDatabaseManager.setMaxQueryResultRows(parseInt(e.target.value));
                    triggerUpdate();
                  }}
                >
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                  <option value={5000}>5,000</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Database List */}
        {databases.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-900">Available Databases</h3>
            <div className="space-y-2">
              {databases.map((db) => (
                <div
                  key={db.id}
                  className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedDatabase === db.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => handleDatabaseSelect(db.id)}
                >
                  <div className="flex items-center space-x-3">
                    <Database className="h-4 w-4 text-gray-500" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{db.name}</span>
                        {selectedDatabase === db.id && (
                          <Badge variant="default" className="text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatFileSize(db.size)} • Uploaded {formatDate(db.uploadedAt)}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDatabase(db.id);
                    }}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {databases.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Database className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm">No databases uploaded yet</p>
            <p className="text-xs text-gray-400">Upload a SQLite database to get started</p>
          </div>
        )}
      </CardContent>
      
      {/* Storage Info Section */}
      <div className="p-4 border-t">
        <StorageInfo onClearAll={() => {
          loadDatabases();
          onDatabaseSelect('');
        }} />
      </div>
    </Card>
  );
}