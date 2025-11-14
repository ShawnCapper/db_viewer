'use client';

import { useState, useEffect } from 'react';
import { SidebarNavigation } from '@/components/SidebarNavigation';
import { TopHeader } from '@/components/TopHeader';
import { DataTableViewer } from '@/components/DataTableViewer';
import { SqlQueryInterface } from '@/components/SqlQueryInterface';
import { clientDatabaseManager } from '@/lib/client-database';

type CurrentView = 'data' | 'query';

export default function Home() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<CurrentView>('data');

  useEffect(() => {
    // Initialize database manager and restore databases
    initializeDatabaseManager();
  }, []);

  const initializeDatabaseManager = async () => {
    try {
      // Initialize the database manager (this will restore databases from IndexedDB)
      await clientDatabaseManager.initialize();
      
      // Check if there's a current database after restoration
      const currentDatabaseId = clientDatabaseManager.getCurrentDatabaseId();
      if (currentDatabaseId) {
        setSelectedDatabase(currentDatabaseId);
      }
    } catch (error) {
      console.error('Error initializing database manager:', error);
    }
  };

  const handleDatabaseSelect = (databaseId: string) => {
    if (!databaseId) {
      setSelectedDatabase(null);
      setSelectedTable(null);
      return;
    }

    try {
      clientDatabaseManager.setCurrentDatabase(databaseId);
      setSelectedDatabase(databaseId);
      setSelectedTable(null); // Reset table selection when database changes
    } catch (error) {
      console.error('Error selecting database:', error);
    }
  };

  const handleTableSelect = (tableName: string) => {
    setSelectedTable(tableName);
    // Auto-switch to data view when selecting a table if not already there
    if (currentView !== 'data') {
      setCurrentView('data');
    }
  };



  const renderMainContent = () => {
    // Show welcome message if no database selected
    if (!selectedDatabase) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold">Welcome to Database Viewer</h2>
            <p className="text-muted-foreground">
              Select a database from the sidebar or upload a new one to get started.
            </p>
          </div>
        </div>
      );
    }

        // Show appropriate view based on current selection
    switch (currentView) {
      case 'data':
        return (
          <DataTableViewer 
            tableName={selectedTable} 
            selectedDatabase={selectedDatabase}
            onTableSelect={handleTableSelect}
          />
        );
      case 'query':
        return <SqlQueryInterface />;
      default:
        return (
          <DataTableViewer 
            tableName={selectedTable}
            selectedDatabase={selectedDatabase}
            onTableSelect={handleTableSelect}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Header */}
      <TopHeader
        selectedDatabase={selectedDatabase}
        selectedTable={selectedTable}
        currentView={currentView}
        onViewChange={setCurrentView}
      />
      
      {/* Main Layout */}
      <div className="flex-1 flex">
        {/* Left Sidebar */}
        <SidebarNavigation
          selectedDatabase={selectedDatabase}
          selectedTable={selectedTable}
          onDatabaseSelect={handleDatabaseSelect}
          onTableSelect={handleTableSelect}
        />
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden">
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}