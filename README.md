# SQLite Database Viewer - Client-Side Edition

A modern, **fully client-side** web application for viewing and querying SQLite databases. All database operations run entirely in your browser using SQL.js (SQLite compiled to WebAssembly) - no server required!

## Key Features

- 🚀 **100% Client-Side**: All database operations run in your browser - no server needed
- 🔒 **Privacy-First**: Your data never leaves your device
- 📦 **Database Upload**: Load SQLite database files (.db, .sqlite, .sqlite3)
- 🗂️ **Schema Inspection**: View table structures, columns, and data types
- 📊 **Data Browsing**: Browse table data with pagination, search, and sorting
- ⚡ **SQL Querying**: Execute custom SQL queries with real-time results
- 💾 **Persistent Storage**: Databases saved in browser's IndexedDB
- 🌐 **Offline Capable**: Works without internet connection
- 🎨 **Modern UI**: Clean, responsive interface inspired by modern database tools

## Architecture

This is a **static web application** that runs entirely in your browser:
- Uses **SQL.js** (SQLite compiled to WebAssembly) for database operations
- Stores databases in browser's **IndexedDB** for persistence
- No server-side code or API endpoints
- Can be deployed to any static hosting service (GitHub Pages, Netlify, Vercel, etc.)

## Getting Started

First, install dependencies and run the development server:

```bash
npm install
npm run dev
# or
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Usage

1. **Upload Database**: Click to upload a SQLite database file (.db, .sqlite, .sqlite3)
2. **Browse Tables**: View table structures and select tables to explore
3. **Query Data**: Browse table data with pagination and filtering
4. **Run SQL**: Execute custom SQL queries in the Query interface
5. **Manage Databases**: Upload multiple databases and switch between them

## Large File Support

The app includes optimizations for larger databases:
- **Allow Large Files**: Enable loading files > 200MB (may impact performance)
- **Memory Optimizations**: Limit query results to prevent browser crashes
- **Max Result Rows**: Configure maximum rows returned per query

⚠️ **Note**: Very large databases (> 1GB) may cause browser memory issues.

## Storage

- Databases are stored in browser's IndexedDB
- Persists across browser sessions
- Typical browser storage quota: 1-2GB
- Can be cleared via the Storage Info section

## Deployment

Build the static site:

```bash
npm run build
```

The app will be exported to the `out/` directory and can be deployed to:
- **GitHub Pages**: Free static hosting
- **Netlify**: Drag-and-drop deployment
- **Vercel**: One-click deployment
- **Any Static Host**: Upload `out/` directory contents

No server configuration needed - just upload the files!

## Browser Compatibility

Requires a modern browser with:
- WebAssembly support
- IndexedDB support
- JavaScript enabled

Tested on: Chrome, Firefox, Safari, Edge (latest versions)

## Technical Details

- **Framework**: Next.js 15 (Static Export)
- **Database Engine**: SQL.js (SQLite WASM)
- **Storage**: IndexedDB API
- **UI**: React 19, Tailwind CSS, Radix UI
- **TypeScript**: Full type safety
