'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HardDrive, Trash2, AlertTriangle } from 'lucide-react';
import { clientDatabaseManager } from '@/lib/client-database';

interface StorageInfoProps {
  onClearAll?: () => void;
}

export function StorageInfo({ onClearAll }: StorageInfoProps) {
  const [storageInfo, setStorageInfo] = useState<{
    usage?: number;
    quota?: number;
    databaseCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStorageInfo();
  }, []);

  const loadStorageInfo = async () => {
    try {
      const info = await clientDatabaseManager.getStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      console.error('Failed to load storage info:', error);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all stored databases? This action cannot be undone and will remove all databases from storage.')) {
      return;
    }

    setLoading(true);
    try {
      await clientDatabaseManager.clearAllStoredDatabases();
      setStorageInfo({ usage: 0, quota: storageInfo?.quota, databaseCount: 0 });
      onClearAll?.();
    } catch (error) {
      console.error('Failed to clear databases:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getUsagePercentage = () => {
    if (!storageInfo?.usage || !storageInfo?.quota) return 0;
    return (storageInfo.usage / storageInfo.quota) * 100;
  };

  if (!storageInfo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <HardDrive className="w-4 h-4" />
            Storage Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading storage information...</p>
        </CardContent>
      </Card>
    );
  }

  const usagePercentage = getUsagePercentage();
  const isHighUsage = usagePercentage > 80;

  return (
    <Card className="bg-sidebar-accent/30 border-sidebar-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
          <HardDrive className="w-4 h-4" />
          Storage Info
          {isHighUsage && <AlertTriangle className="w-4 h-4 text-amber-500" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-sidebar-muted">Databases:</span>
            <Badge variant="secondary" className="bg-sidebar-primary/20 text-sidebar-primary">{storageInfo.databaseCount}</Badge>
          </div>
          
          {storageInfo.usage !== undefined && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-sidebar-muted">Used:</span>
              <span className="text-sidebar-foreground font-medium">{formatBytes(storageInfo.usage)}</span>
            </div>
          )}
          
          {storageInfo.quota !== undefined && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-sidebar-muted">Available:</span>
              <span className="text-sidebar-foreground font-medium">{formatBytes(storageInfo.quota)}</span>
            </div>
          )}
          
          {storageInfo.usage && storageInfo.quota && (
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Usage</span>
                <span>{usagePercentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    isHighUsage ? 'bg-amber-500' : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {storageInfo.databaseCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={loading}
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive border-sidebar-border"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            {loading ? 'Clearing...' : 'Clear All Databases'}
          </Button>
        )}

        {isHighUsage && (
          <div className="p-2 bg-amber-950/30 border border-amber-800 rounded-md">
            <p className="text-xs text-amber-400">
              Storage usage is high. Consider removing unused databases.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}