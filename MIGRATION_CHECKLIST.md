# Client-Side Migration Checklist

✅ **Completed Changes**

## Code Changes
- [x] Removed `src/app/api/` directory (all server-side API routes)
- [x] Removed `uploadLargeDatabase()` method from `client-database.ts`
- [x] Removed `syncServerDatabases()` method from `client-database.ts`
- [x] Removed all `fetch()` calls to API endpoints
- [x] Removed `storageMode` property from `DatabaseInfo` interface
- [x] Updated all database methods to be client-only
- [x] Updated `DatabaseUploader.tsx` to remove server upload logic
- [x] Updated `layout.tsx` to remove server-side Metadata
- [x] Added `output: 'export'` to `next.config.ts`

## Documentation
- [x] Updated `README.md` with client-side architecture information
- [x] Created `CLIENT_SIDE_MIGRATION.md` with detailed migration notes
- [x] Updated package.json scripts with export and preview commands

## Verification
- [x] No TypeScript errors in core files
- [x] No server-side dependencies remaining
- [x] All database operations use SQL.js
- [x] IndexedDB storage working
- [x] Static export configuration in place

## Testing Checklist

Before deploying, test the following:

### Basic Functionality
- [ ] Upload a small database (< 10MB)
- [ ] View table schema
- [ ] Browse table data
- [ ] Execute SQL queries
- [ ] Close browser and reopen - database should persist
- [ ] Upload multiple databases
- [ ] Switch between databases
- [ ] Delete a database

### Large File Handling
- [ ] Enable "Allow Large Files" option
- [ ] Upload a database > 200MB
- [ ] Verify memory optimization settings work
- [ ] Test with different max result row limits

### Storage & Persistence
- [ ] Check storage info displays correctly
- [ ] Verify databases persist across sessions
- [ ] Test clearing all databases
- [ ] Monitor browser console for errors

### Build & Deploy
- [ ] Run `npm run build` successfully
- [ ] Verify `out/` directory is created
- [ ] Test with `npm run preview` (local preview)
- [ ] Deploy to static hosting
- [ ] Test deployed version

## Known Limitations

⚠️ **Important Notes:**
1. Browser memory limits apply (typically 1-2GB for IndexedDB)
2. Very large databases (> 1GB) may cause browser crashes
3. No multi-user sharing capability
4. No server-side query optimization for complex queries
5. Initial load of large databases can be slow

## Rollback Plan

If you need to rollback to server-side functionality:
1. Restore `src/app/api/` directory from git history
2. Revert changes to `client-database.ts`
3. Revert changes to `DatabaseUploader.tsx`
4. Remove `output: 'export'` from `next.config.ts`
5. Restore original `layout.tsx` with Metadata export

```bash
# To rollback (if needed)
git log --oneline  # Find commit before migration
git revert <commit-hash>
```

## Performance Tips

For optimal performance with large databases:
1. Enable memory optimizations
2. Set appropriate max result rows
3. Use indexed columns in WHERE clauses
4. Limit result sets with LIMIT clauses
5. Avoid SELECT * on large tables
6. Consider exporting subsets of very large databases

## Deployment Examples

### GitHub Pages
```bash
npm run build
# Upload 'out/' directory contents
```

### Netlify
```bash
# Build command: npm run build
# Publish directory: out
```

### Vercel
```bash
# Build command: npm run build
# Output directory: out
```

### Custom Server (nginx)
```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/db-viewer/out;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
