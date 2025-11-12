'use client';

import initSqlJs, { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { indexedDBStorage, StoredDatabaseInfo } from './indexeddb-storage';
import { INTERNAL_ROWID_COLUMN, RowIdentifier, RowValueMap } from './database-types';

export interface TableInfo {
  name: string;
  sql: string;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  totalCount?: number;
  limit?: number;
  offset?: number;
}

export interface DatabaseInfo {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
}

class ClientDatabaseManager {
  private sql: SqlJsStatic | null = null;
  private currentDatabase: Database | null = null;
  private currentDatabaseInfo: DatabaseInfo | null = null;
  private databases: Map<string, { db: Database | null; info: DatabaseInfo }> = new Map();
  private initialized = false;
  private lastSelectedDatabaseId: string | null = null;
  
  // Configuration for large file handling
  static readonly MAX_DB_SIZE_BYTES = 200 * 1024 * 1024; // 200MB default limit
  private allowLargeFiles = false;
  private maxQueryResultRows = 1000; // Limit result rows for large databases
  private useMemoryOptimizations = true;
  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private normalizeValue(value: unknown): SqlValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' || typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return String(value);
  }

  private async persistDatabaseChanges(info: DatabaseInfo, db: Database): Promise<void> {
    const buffer = db.export();
    const storedInfo: StoredDatabaseInfo = {
      id: info.id,
      name: info.name,
      size: buffer.length,
      uploadedAt: info.uploadedAt,
      buffer,
    };
    await indexedDBStorage.storeDatabase(storedInfo);
    info.size = buffer.length;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize sql.js
      this.sql = await initSqlJs({
        locateFile: (_file: string) => `/sql-wasm.wasm`
      });

      // Initialize IndexedDB
      await indexedDBStorage.initialize();

      // Restore databases from IndexedDB
      await this.restoreDatabasesFromStorage();

      // Restore last selected database
      this.restoreLastSelectedDatabase();

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize database manager:', error);
      throw new Error('Failed to initialize SQLite engine');
    }
  }

  // Configuration methods for large file handling
  setAllowLargeFiles(allow: boolean): void {
    this.allowLargeFiles = allow;
  }

  getAllowLargeFiles(): boolean {
    return this.allowLargeFiles;
  }

  setMaxQueryResultRows(maxRows: number): void {
    this.maxQueryResultRows = Math.max(100, maxRows); // Minimum 100 rows
  }

  getMaxQueryResultRows(): number {
    return this.maxQueryResultRows;
  }

  setMemoryOptimizations(enabled: boolean): void {
    this.useMemoryOptimizations = enabled;
  }

  getMemoryOptimizations(): boolean {
    return this.useMemoryOptimizations;
  }

  // Attempt to load a large database with streaming/chunked approach
  async loadLargeDatabase(file: File): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // For very large files, we'll try to load in chunks and create a temporary database
      console.log(`Attempting to load large database: ${file.name} (${(file.size / (1024*1024)).toFixed(1)}MB)`);
      
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Create database from file buffer (this might still fail for very large files)
  const db = new this.sql!.Database(uint8Array);
      
      // Generate unique ID for the database
      const timestamp = Date.now();
      const databaseId = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      const dbInfo: DatabaseInfo = {
        id: databaseId,
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString()
      };

      // Store the database in memory (don't persist to IndexedDB for large files)
      this.databases.set(databaseId, { db, info: dbInfo });
      
      // Set as current database
      this.setCurrentDatabase(databaseId);
      
      return databaseId;
    } catch (error) {
      console.error('Error loading large database:', error);
      
      // Handle specific error types
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('out of memory') || msg.includes('memory') || msg.includes('allocation')) {
          throw new Error('Out of memory while loading the database. This file is too large to load in-browser. Please use a desktop SQLite client or try exporting a smaller subset of the data.');
        }
      }
      
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(msg || 'Failed to load large database file.');
    }
  }



  // Create a preview/summary of a database file without fully loading it
  async createDatabasePreview(file: File): Promise<{
    canLoad: boolean;
    size: string;
    reason: string;
    suggestion: string;
  }> {
    const sizeMB = file.size / (1024 * 1024);
    const sizeGB = sizeMB / 1024;
    
    if (file.size <= ClientDatabaseManager.MAX_DB_SIZE_BYTES) {
      return {
        canLoad: true,
        size: `${sizeMB.toFixed(1)}MB`,
        reason: 'File size is within safe limits for browser loading',
        suggestion: 'You can load this database normally'
      };
    } else if (file.size <= 1024 * 1024 * 1024) { // Up to 1GB
      return {
        canLoad: false,
        size: `${sizeMB.toFixed(1)}MB`,
        reason: 'File is too large for safe browser loading but might work with optimizations',
        suggestion: 'Try enabling "Allow Large Files" option, but expect potential memory issues. Consider exporting a smaller subset or using a desktop SQLite client.'
      };
    } else {
      return {
        canLoad: false,
        size: sizeGB >= 1 ? `${sizeGB.toFixed(1)}GB` : `${sizeMB.toFixed(1)}MB`,
        reason: 'File is too large for browser-based SQLite processing',
        suggestion: 'Please use a desktop SQLite client like DB Browser for SQLite, or export a smaller subset of your data (e.g., recent records, specific tables, or sampled data).'
      };
    }
  }

  private async restoreDatabasesFromStorage(): Promise<void> {
    try {
      const storedDatabases = await indexedDBStorage.getAllDatabases();
      
      for (const storedDb of storedDatabases) {
        try {
          // Recreate Database instance from stored buffer
          const db = new this.sql!.Database(storedDb.buffer);
          
          const dbInfo: DatabaseInfo = {
            id: storedDb.id,
            name: storedDb.name,
            size: storedDb.size,
            uploadedAt: storedDb.uploadedAt
          };

          this.databases.set(storedDb.id, { db, info: dbInfo });
        } catch (error) {
          console.error(`Failed to restore database ${storedDb.id}:`, error);
          // Remove corrupted database from storage
          await indexedDBStorage.deleteDatabase(storedDb.id);
        }
      }
    } catch (error) {
      console.error('Failed to restore databases from storage:', error);
    }
  }



  private restoreLastSelectedDatabase(): void {
    try {
      const lastSelected = localStorage.getItem('lastSelectedDatabase');
      if (lastSelected && this.databases.has(lastSelected)) {
        this.setCurrentDatabase(lastSelected);
      }
    } catch (error) {
      console.error('Failed to restore last selected database:', error);
    }
  }

  private saveLastSelectedDatabase(databaseId: string | null): void {
    try {
      if (databaseId) {
        localStorage.setItem('lastSelectedDatabase', databaseId);
      } else {
        localStorage.removeItem('lastSelectedDatabase');
      }
    } catch (error) {
      console.error('Failed to save last selected database:', error);
    }
  }

  async loadDatabase(file: File): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check file size unless large files are explicitly allowed
    if (!this.allowLargeFiles && file.size > ClientDatabaseManager.MAX_DB_SIZE_BYTES) {
      const mb = Math.round(ClientDatabaseManager.MAX_DB_SIZE_BYTES / (1024 * 1024));
      throw new Error(
        `This viewer runs fully in-browser using WebAssembly and can't safely load databases larger than ~${mb}MB. ` +
        `The selected file is ${(file.size / (1024*1024)).toFixed(1)}MB. ` +
        `Please trim/export a smaller subset, or use a desktop SQLite client for very large files.`
      );
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Create database from file buffer
  const db = new this.sql!.Database(uint8Array);
      
      // Generate unique ID for the database
      const timestamp = Date.now();
      const databaseId = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      const dbInfo: DatabaseInfo = {
        id: databaseId,
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString()
      };

      // Store the database in memory
      this.databases.set(databaseId, { db, info: dbInfo });
      
      // Persist to IndexedDB
      const storedInfo: StoredDatabaseInfo = {
        ...dbInfo,
        buffer: uint8Array
      };
      await indexedDBStorage.storeDatabase(storedInfo);
      
      // Set as current database
      this.setCurrentDatabase(databaseId);
      
      return databaseId;
    } catch (error) {
      console.error('Error loading database:', error);
      
      // Handle specific error types
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('out of memory') || msg.includes('memory') || msg.includes('allocation')) {
          throw new Error('Out of memory while loading the database. Large SQLite files are not supported in-browser. Try a smaller file or use a desktop client.');
        }
      }
      
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(msg || 'Failed to load database file. Please ensure it\'s a valid SQLite database.');
    }
  }

  setCurrentDatabase(databaseId: string): void {
    const dbEntry = this.databases.get(databaseId);
    if (!dbEntry) {
      throw new Error(`Database with ID ${databaseId} not found`);
    }
    
    this.currentDatabase = dbEntry.db;
    this.currentDatabaseInfo = dbEntry.info;
    this.lastSelectedDatabaseId = databaseId;
    
    // Save to localStorage for persistence
    this.saveLastSelectedDatabase(databaseId);
  }

  getCurrentDatabaseId(): string | null {
    return this.currentDatabaseInfo?.id || null;
  }

  getCurrentDatabaseInfo(): DatabaseInfo | null {
    return this.currentDatabaseInfo;
  }

  getDatabases(): DatabaseInfo[] {
    return Array.from(this.databases.values()).map(entry => entry.info);
  }

  async getTables(databaseId?: string): Promise<TableInfo[]> {
    const db = this.getDatabase(databaseId);
    
    try {
      const stmt = db.prepare(`
        SELECT name, sql 
        FROM sqlite_master 
        WHERE type='table' 
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);
      
      const tables: TableInfo[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        tables.push({
          name: row.name as string,
          sql: row.sql as string
        });
      }
      
      stmt.free();
      return tables;
    } catch (error) {
      console.error('Error getting tables:', error);
      throw new Error('Failed to retrieve tables from database');
    }
  }

  async getTableColumns(tableName: string, databaseId?: string): Promise<ColumnInfo[]> {
    const db = this.getDatabase(databaseId);
    
    try {
  const stmt = db.prepare(`PRAGMA table_info(${this.quoteIdentifier(tableName)})`);
      const columns: ColumnInfo[] = [];
      
      while (stmt.step()) {
        const row = stmt.getAsObject();
        columns.push({
          cid: row.cid as number,
          name: row.name as string,
          type: row.type as string,
          notnull: row.notnull as number,
          dflt_value: row.dflt_value,
          pk: row.pk as number
        });
      }
      
      stmt.free();
      return columns;
    } catch (error) {
      console.error('Error getting table columns:', error);
      throw new Error(`Failed to retrieve columns for table ${tableName}`);
    }
  }

  async getTableData(tableName: string, limit: number = 100, offset: number = 0, databaseId?: string): Promise<QueryResult> {
    const db = this.getDatabase(databaseId);
    
    // Apply memory optimizations for large databases
    if (this.useMemoryOptimizations) {
      limit = Math.min(limit, this.maxQueryResultRows);
    }
    
    try {
      // Get total count (skip for very large tables if memory optimizations are enabled)
      let totalRows = 0;
      if (!this.useMemoryOptimizations || limit <= 1000) {
      const countStmt = db.prepare(`SELECT COUNT(*) as count FROM ${this.quoteIdentifier(tableName)}`);
        countStmt.step();
        const countResult = countStmt.getAsObject();
        totalRows = countResult.count as number;
        countStmt.free();
      } else {
        // For very large tables, use an estimated count
        totalRows = -1; // Indicates unknown/estimated
      }

      // Get data with limit and offset
      const dataStmt = db.prepare(`SELECT rowid as ${this.quoteIdentifier(INTERNAL_ROWID_COLUMN)}, * FROM ${this.quoteIdentifier(tableName)} LIMIT ? OFFSET ?`);
      dataStmt.bind([limit, offset]);
      
      const columns: string[] = [];
      const rows: unknown[][] = [];
      
      // Get column names from the first row
      if (dataStmt.step()) {
        const firstRow = dataStmt.getAsObject();
        columns.push(...Object.keys(firstRow));
        rows.push(Object.values(firstRow));
        
        // Get remaining rows
        while (dataStmt.step()) {
          const row = dataStmt.getAsObject();
          rows.push(Object.values(row));
        }
      }
      
      dataStmt.free();
      
      return {
        columns,
        rows,
        rowCount: totalRows,
        totalCount: totalRows,
        limit,
        offset
      };
    } catch (error) {
      console.error('Error getting table data:', error);
      throw new Error(`Failed to retrieve data from table ${tableName}`);
    }
  }

  async executeQuery(query: string, databaseId?: string): Promise<QueryResult> {
    const db = this.getDatabase(databaseId);
    
    try {
      const stmt = db.prepare(query);
      const columns: string[] = [];
      const rows: unknown[][] = [];
      let rowCount = 0;
      
      if (stmt.step()) {
        const firstRow = stmt.getAsObject();
        columns.push(...Object.keys(firstRow));
        rows.push(Object.values(firstRow));
        rowCount++;
        
        // Apply memory optimization limits to prevent browser crashes
        const maxRows = this.useMemoryOptimizations ? this.maxQueryResultRows : Number.MAX_SAFE_INTEGER;
        
        while (stmt.step() && rowCount < maxRows) {
          const row = stmt.getAsObject();
          rows.push(Object.values(row));
          rowCount++;
        }
        
        // Check if we hit the limit
        if (rowCount >= maxRows && stmt.step()) {
          console.warn(`Query result limited to ${maxRows} rows for memory optimization`);
        }
      }
      
      stmt.free();
      
      return {
        columns,
        rows,
        rowCount: rows.length,
        totalCount: rowCount >= (this.useMemoryOptimizations ? this.maxQueryResultRows : Number.MAX_SAFE_INTEGER) ? -1 : rows.length
      };
    } catch (error) {
      console.error('Error executing query:', error);
      throw new Error(`SQL Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async insertRow(tableName: string, values: RowValueMap, databaseId?: string): Promise<void> {
    const db = this.getDatabase(databaseId);
    const info = this.getDatabaseInfo(databaseId);
    const entries = Object.entries(values).filter(([key]) => key !== INTERNAL_ROWID_COLUMN);

    db.exec('BEGIN TRANSACTION;');
    try {
      if (entries.length === 0) {
        db.run(`INSERT INTO ${this.quoteIdentifier(tableName)} DEFAULT VALUES`);
      } else {
  const columnsSql = entries.map(([col]) => this.quoteIdentifier(col)).join(', ');
  const placeholders = entries.map(() => '?').join(', ');
  const params = entries.map(([, value]) => this.normalizeValue(value));
  db.run(`INSERT INTO ${this.quoteIdentifier(tableName)} (${columnsSql}) VALUES (${placeholders})`, params);
      }
      db.exec('COMMIT;');
      await this.persistDatabaseChanges(info, db);
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch {}
      throw error;
    }
  }

  async updateRow(tableName: string, identifier: RowIdentifier, values: RowValueMap, databaseId?: string): Promise<void> {
    const db = this.getDatabase(databaseId);
    const info = this.getDatabaseInfo(databaseId);
  const entries = Object.entries(values).filter(([key]) => key !== INTERNAL_ROWID_COLUMN);
    if (entries.length === 0) {
      return;
    }

    const setClause = entries.map(([col]) => `${this.quoteIdentifier(col)} = ?`).join(', ');
  const params = entries.map(([, value]) => this.normalizeValue(value));
    const where = this.buildWhereClause(identifier);
    if (!where.clause) {
      throw new Error('Unable to determine row identifier for update');
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.run(
        `UPDATE ${this.quoteIdentifier(tableName)} SET ${setClause} WHERE ${where.clause}`,
        [...params, ...where.params]
      );
      db.exec('COMMIT;');
      await this.persistDatabaseChanges(info, db);
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch {}
      throw error;
    }
  }

  async deleteRow(tableName: string, identifier: RowIdentifier, databaseId?: string): Promise<void> {
    const db = this.getDatabase(databaseId);
    const info = this.getDatabaseInfo(databaseId);
    const where = this.buildWhereClause(identifier);
    if (!where.clause) {
      throw new Error('Unable to determine row identifier for deletion');
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.run(`DELETE FROM ${this.quoteIdentifier(tableName)} WHERE ${where.clause}`, where.params);
      db.exec('COMMIT;');
      await this.persistDatabaseChanges(info, db);
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch {}
      throw error;
    }
  }

  private buildWhereClause(identifier: RowIdentifier): { clause: string; params: SqlValue[] } {
    if (!identifier) {
      return { clause: '', params: [] };
    }

    if (identifier.rowid !== undefined && identifier.rowid !== null) {
      return { clause: 'rowid = ?', params: [this.normalizeValue(identifier.rowid)] };
    }

    if (identifier.primaryKeyValues && Object.keys(identifier.primaryKeyValues).length > 0) {
      const parts = Object.entries(identifier.primaryKeyValues).map(([col]) => `${this.quoteIdentifier(col)} = ?`);
      const params = Object.values(identifier.primaryKeyValues).map(value => this.normalizeValue(value));
      return { clause: parts.join(' AND '), params };
    }

    return { clause: '', params: [] };
  }

  async removeDatabase(databaseId: string): Promise<void> {
    const entry = this.databases.get(databaseId);
    if (!entry) return;
    
    entry.db?.close();
    this.databases.delete(databaseId);
    try { await indexedDBStorage.deleteDatabase(databaseId); } catch (e) { console.error(e); }
    
    if (this.currentDatabaseInfo?.id === databaseId) {
      this.currentDatabase = null;
      this.currentDatabaseInfo = null;
      this.lastSelectedDatabaseId = null;
      this.saveLastSelectedDatabase(null);
    }
  }

  private getDatabase(databaseId?: string): Database {
    if (databaseId) {
      const dbEntry = this.databases.get(databaseId);
      if (!dbEntry) {
        throw new Error(`Database with ID ${databaseId} not found`);
      }
      if (!dbEntry.db) {
        throw new Error('Database not loaded in memory');
      }
      return dbEntry.db;
    }
    
    if (!this.currentDatabase) {
      throw new Error('No database selected');
    }
    
    return this.currentDatabase;
  }

  private getDatabaseInfo(databaseId?: string): DatabaseInfo {
    if (databaseId) {
      const entry = this.databases.get(databaseId);
      if (!entry) throw new Error(`Database with ID ${databaseId} not found`);
      return entry.info;
    }
    if (!this.currentDatabaseInfo) throw new Error('No database selected');
    return this.currentDatabaseInfo;
  }

  // Get storage usage information
  async getStorageInfo(): Promise<{ usage?: number; quota?: number; databaseCount: number }> {
    const storageEstimate = await indexedDBStorage.getStorageEstimate();
    const databaseCount = await indexedDBStorage.getDatabaseCount();
    
    return {
      usage: storageEstimate.usage,
      quota: storageEstimate.quota,
      databaseCount
    };
  }

  // Clear all stored databases (useful for debugging/testing)
  async clearAllStoredDatabases(): Promise<void> {
    // Close all databases
    for (const [_id, entry] of this.databases) {
      if (entry.db) entry.db.close();
    }
    this.databases.clear();
    this.currentDatabase = null;
    this.currentDatabaseInfo = null;
    this.lastSelectedDatabaseId = null;
    
    // Clear IndexedDB
    await indexedDBStorage.clearAllDatabases();
    
    // Clear localStorage
    this.saveLastSelectedDatabase(null);
  }

  // Cleanup method
  cleanup(): void {
    for (const [_id, entry] of this.databases) {
      if (entry.db) entry.db.close();
    }
    this.databases.clear();
    this.currentDatabase = null;
    this.currentDatabaseInfo = null;
    this.lastSelectedDatabaseId = null;
    
    // Close IndexedDB connection
    indexedDBStorage.close();
  }
}

// Create singleton instance
export const clientDatabaseManager = new ClientDatabaseManager();