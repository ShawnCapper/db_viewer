'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database, Plus, Upload, X, AlertCircle, FileCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { clientDatabaseManager, DatabaseInfo } from '@/lib/client-database';
import { StorageInfo } from './StorageInfo';
import { TableSchema } from './TableSchema';

interface TableWithRowCount {
  name: string;
  sql: string;
  rowCount?: number;
}

interface SidebarNavigationProps {
  selectedDatabase: string | null;
  selectedTable: string | null;
  onDatabaseSelect: (databaseId: string) => void;
  onTableSelect: (tableName: string) => void;
}

export function SidebarNavigation({
  selectedDatabase,
  selectedTable,
  onDatabaseSelect,
  onTableSelect,
}: SidebarNavigationProps) {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [tables, setTables] = useState<TableWithRowCount[]>([]);
  const [isDbExpanded, setIsDbExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    // Ensure the client database manager is initialized before trying to fetch stored databases.
    // This prevents a race where the manager hasn't restored databases from IndexedDB yet,
    // causing the sidebar to show "No databases loaded" on reload.
    (async () => {
      try {
        await clientDatabaseManager.initialize();
      } catch (err) {
        console.error('Sidebar: failed to initialize database manager', err);
      }
      fetchDatabases();
    })();
  }, []);

  useEffect(() => {
    // Keep fetching tables for counts and schema panel, but we no longer render them here.
    if (selectedDatabase) {
      fetchTables();
    } else {
      setTables([]);
    }
  }, [selectedDatabase]);

  const fetchDatabases = async () => {
    try {
      const dbInfos = clientDatabaseManager.getDatabases();
      setDatabases(dbInfos);
    } catch (error) {
      console.error('Error fetching databases:', error);
    }
  };

  const fetchTables = async () => {
    if (!selectedDatabase) return;
    
    setLoading(true);
    try {
      // Get tables using the client database manager
      const tableInfos = await clientDatabaseManager.getTables(selectedDatabase);
      
      // Convert to our format and optionally get row counts
      const tablesWithRowCount: TableWithRowCount[] = await Promise.all(
        tableInfos.map(async (table) => {
          try {
            // Get row count for each table
            const result = await clientDatabaseManager.executeQuery(
              `SELECT COUNT(*) as count FROM ${table.name}`, 
              selectedDatabase
            );
            const rowCount = result.rows[0]?.[0] as number || 0;
            
            return {
              name: table.name,
              sql: table.sql,
              rowCount
            };
          } catch (error) {
            // If there's an error getting row count, just return the table without it
            console.warn(`Could not get row count for table ${table.name}:`, error);
            return {
              name: table.name,
              sql: table.sql
            };
          }
        })
      );
      
      setTables(tablesWithRowCount);
    } catch (error) {
      console.error('Error fetching tables:', error);
      setTables([]);
    } finally {
      setLoading(false);
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

    setUploadLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let databaseId: string;
      // Load database in the browser (with optimizations for large files)
      if (file.size > 200 * 1024 * 1024) {
        databaseId = await clientDatabaseManager.loadLargeDatabase(file);
        setSuccess(`Large database "${file.name}" loaded with memory optimizations.`);
      } else {
        databaseId = await clientDatabaseManager.loadDatabase(file);
        setSuccess(`Database "${file.name}" loaded successfully!`);
      }
      fetchDatabases();
      // Auto-select the newly loaded database
      onDatabaseSelect(databaseId);
      setShowUpload(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load database. Please try again.');
      console.error('Load error:', error);
    } finally {
      setUploadLoading(false);
      // Reset the input
      event.target.value = '';
    }
  }, [onDatabaseSelect]);

  const handleDeleteDatabase = async (databaseId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to remove this database? This action cannot be undone.')) {
      return;
    }

    setUploadLoading(true);
    try {
      await clientDatabaseManager.removeDatabase(databaseId);
      fetchDatabases();
      
      // If this was the selected database, clear the selection
      if (selectedDatabase === databaseId) {
        onDatabaseSelect('');
      }
    } catch (error) {
      setError('Failed to remove database. Please try again.');
      console.error('Delete error:', error);
    } finally {
      setUploadLoading(false);
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
    return new Date(dateString).toLocaleDateString();
  };

  const filteredTables = tables.filter(table =>
    table.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="sidebar-nav w-64 h-full flex flex-col">
      {/* Logo/Header */}
      <div className="sidebar-nav-header p-4">
        <div className="flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg text-sidebar-foreground">Database Viewer</span>
        </div>
      </div>

      {/* Database Selector */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="sidebar-section-title">PROJECT</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUpload(!showUpload)}
              className="h-7 w-7 p-0 hover:bg-sidebar-accent text-sidebar-muted hover:text-sidebar-foreground"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Upload Section */}
          {showUpload && (
            <div className="space-y-3 p-3 bg-sidebar-accent border border-sidebar-border rounded-lg">
              <div className="text-center">
                <Upload className="mx-auto h-8 w-8 text-sidebar-muted" />
                <label htmlFor="database-upload" className="cursor-pointer block mt-2">
                  <span className="text-sm font-medium text-sidebar-foreground">Upload SQLite Database</span>
                  <span className="block text-xs text-sidebar-muted mt-1">
                    .db, .sqlite, or .sqlite3 files
                  </span>
                </label>
                <Input
                  id="database-upload"
                  type="file"
                  accept=".db,.sqlite,.sqlite3"
                  onChange={handleFileUpload}
                  disabled={uploadLoading}
                  className="mt-2 text-xs"
                />
                {uploadLoading && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-xs text-muted-foreground">Loading...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status Messages */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-md">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-2.5 text-xs text-green-400 bg-green-950/30 border border-green-900/50 rounded-md">
              <FileCheck className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}
          
          <div className="space-y-1.5">
            {databases.length === 0 ? (
              <div className="text-sm text-sidebar-muted py-2 px-3">
                No databases loaded
              </div>
            ) : (
              databases.map((db) => (
                <div
                  key={db.id}
                  className={`sidebar-nav-item group w-full text-left px-3 py-2.5 rounded-md text-sm flex items-center justify-between cursor-pointer ${
                    selectedDatabase === db.id ? 'active' : ''
                  }`}
                  onClick={() => onDatabaseSelect(db.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Database className="h-4 w-4 flex-shrink-0 text-sidebar-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{db.name}</div>
                      <div className="text-xs text-sidebar-muted mt-0.5">
                        {formatFileSize(db.size)} • {formatDate(db.uploadedAt)}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDeleteDatabase(db.id, e)}
                    className="h-7 w-7 p-0 text-sidebar-muted hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tables Section removed: table switching is now handled by top tabs above the table. */}

      {/* Schema Section */}
      {selectedTable && (
        <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/30">
          <TableSchema 
            tableName={selectedTable} 
            compact={true} 
            collapsible={true} 
            initialCollapsed={false} 
          />
        </div>
      )}

      {/* Storage Info */}
      <div className="p-4 border-t border-sidebar-border mt-auto">
        <StorageInfo onClearAll={() => {
          fetchDatabases();
          onDatabaseSelect('');
          setSuccess('All databases cleared successfully');
        }} />
      </div>
    </div>
  );
}