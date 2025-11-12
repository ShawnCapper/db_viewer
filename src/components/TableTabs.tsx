'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { clientDatabaseManager, TableInfo } from '@/lib/client-database';
import { Loader2 } from 'lucide-react';

interface TableTabsProps {
  selectedDatabase: string | null;
  selectedTable: string | null;
  onTableSelect: (tableName: string) => void;
}

export function TableTabs({ selectedDatabase, selectedTable, onTableSelect }: TableTabsProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadTables() {
      if (!selectedDatabase) {
        setTables([]);
        return;
      }
      setLoading(true);
      try {
        // Ensure DB manager is ready and fetch tables for current DB
        await clientDatabaseManager.initialize();
        const list = await clientDatabaseManager.getTables(selectedDatabase);
        if (!cancelled) {
          setTables(list);
          // If no table selected yet, auto-select first one
          if (!selectedTable && list.length > 0) {
            onTableSelect(list[0].name);
          } else if (selectedTable && !list.find(t => t.name === selectedTable)) {
            // Selected table no longer exists; pick first available
            if (list.length > 0) onTableSelect(list[0].name);
          }
        }
      } catch (e) {
        console.error('Failed to load tables for tabs', e);
        if (!cancelled) setTables([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadTables();
    return () => { cancelled = true; };
  }, [selectedDatabase]);

  const value = useMemo(() => selectedTable ?? (tables[0]?.name ?? ''), [selectedTable, tables]);

  if (!selectedDatabase) return null;

  return (
    <div className="px-0 py-0">
      {loading && tables.length === 0 ? (
        <div className="h-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tables…
        </div>
      ) : tables.length === 0 ? (
        <div className="h-8 flex items-center text-sm text-muted-foreground">
          No tables found in this database
        </div>
      ) : (
        <Tabs value={value} onValueChange={onTableSelect} className="w-full">
          <div className="overflow-x-auto no-scrollbar">
            <TabsList className="min-w-max">
              {tables.map(t => (
                <TabsTrigger key={t.name} value={t.name} className="px-3">
                  {t.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      )}
    </div>
  );
}
