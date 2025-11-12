'use client';

import { useState } from 'react';
import { Search, User, Settings, HelpCircle, Bell, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface TopHeaderProps {
  selectedDatabase: string | null;
  selectedTable: string | null;
  currentView: 'data' | 'query';
  onViewChange: (view: 'data' | 'query') => void;
}

export function TopHeader({
  selectedDatabase,
  selectedTable,
  currentView,
  onViewChange,
}: TopHeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const viewTabs = [
    { id: 'data' as const, label: 'Table Editor', description: 'Browse and edit data' },
    { id: 'query' as const, label: 'SQL Editor', description: 'Run custom queries' },
  ];

  return (
    <div className="top-header h-14 px-6 flex items-center justify-between">
      {/* Left side - Breadcrumb and tabs */}
      <div className="flex items-center gap-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Database:</span>
          <span className="font-medium">
            {selectedDatabase || 'No database selected'}
          </span>
          {selectedTable && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">{selectedTable}</span>
            </>
          )}
        </div>

        {/* View tabs */}
        {selectedDatabase && (
          <div className="flex items-center gap-1">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onViewChange(tab.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  currentView === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title={tab.description}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right side - Search and actions */}
      <div className="flex items-center gap-3">
        {/* Global search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tables, columns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-64 h-8 bg-input border-border"
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <Command className="h-3 w-3" />K
            </kbd>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Future action buttons can go here */}
        </div>
      </div>
    </div>
  );
}