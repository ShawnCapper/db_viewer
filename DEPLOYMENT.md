# Deployment Guide for DB Viewer

This guide will help you deploy the DB Viewer webapp to various hosting platforms. The app is built as a static Next.js export and can be deployed to any static hosting service.

## Build Output

The production build is located in the `out/` directory after running `npm run build`. This directory contains all the static files needed to deploy the app.

## Deployment Options

### Option 1: GitHub Pages (Free)

1. **Create a GitHub repository:**
   ```bash
   # Create a new repository on GitHub (e.g., "db-viewer")
   # Then connect your local repository:
   git remote add origin https://github.com/YOUR_USERNAME/db-viewer.git
   git branch -M main
   git push -u origin main
   ```

2. **Deploy using GitHub Actions:**
   
   Create `.github/workflows/deploy.yml`:
   ```yaml
   name: Deploy to GitHub Pages
   
   on:
     push:
       branches: [ main ]
     workflow_dispatch:
   
   permissions:
     contents: read
     pages: write
     id-token: write
   
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: 'npm'
         - run: npm ci
         - run: npm run build
         - uses: actions/upload-pages-artifact@v3
           with:
             path: ./out
     
     deploy:
       needs: build
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - id: deployment
           uses: actions/deploy-pages@v4
   ```

3. **Enable GitHub Pages:**
   - Go to your repository settings
   - Navigate to "Pages" under "Code and automation"
   - Select "GitHub Actions" as the source
   - Your site will be live at `https://YOUR_USERNAME.github.io/db-viewer/`

### Option 2: Vercel (Recommended - Free)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   cd "d:\Programming\Media Analysis\db_viewer"
   vercel
   ```

3. **Follow the prompts:**
   - Link to existing project or create new
   - Configure project settings (use defaults)
   - Deploy!

4. **Your site will be live at:** `https://your-project.vercel.app`

**Or use the Vercel Web Interface:**
- Go to [vercel.com](https://vercel.com)
- Click "Add New Project"
- Import your GitHub repository
- Vercel will auto-detect Next.js and deploy

### Option 3: Netlify (Free)

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy:**
   ```bash
   cd "d:\Programming\Media Analysis\db_viewer"
   netlify deploy
   ```

3. **Follow the prompts:**
   - Authorize Netlify CLI
   - Choose "Create & configure a new site"
   - Set publish directory to: `out`

4. **For production deployment:**
   ```bash
   netlify deploy --prod
   ```

**Or use Netlify Drop (easiest):**
- Build locally: `npm run build`
- Go to [app.netlify.com/drop](https://app.netlify.com/drop)
- Drag and drop the `out` folder
- Instant deployment!

### Option 4: Custom Server / VPS

If you have your own web server:

1. **Build the app:**
   ```bash
   cd "d:\Programming\Media Analysis\db_viewer"
   npm run build
   ```

2. **Upload the `out/` directory to your web server**

3. **Configure your web server:**
   - Point document root to the uploaded `out` directory
   - Ensure all routes serve `index.html` for client-side routing

Example nginx configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/out;
    index index.html;
    
    location / {
        try_files $uri $uri.html $uri/ /index.html;
    }
}
```

## Pre-Deployment Checklist

- [x] Build completes successfully (`npm run build`)
- [x] `.gitignore` properly configured (doesn't include `node_modules`, `out`, etc.)
- [x] Static export enabled in `next.config.ts`
- [x] No server-side code dependencies
- [x] All database operations run client-side

## Environment Setup

This is a fully client-side app with no environment variables required. All database operations run in the browser using SQL.js and IndexedDB.

## Post-Deployment

After deployment, your app will be accessible at the provided URL. Users can:
- Upload SQLite databases (stored in browser IndexedDB)
- Browse tables and schemas
- Execute SQL queries
- All operations run 100% client-side - no data leaves the user's browser

## Updating the Deployment

To update your deployed app:

1. Make changes locally
2. Commit changes: `git commit -am "Update message"`
3. Push to repository: `git push`
4. Most platforms (Vercel, Netlify, GitHub Pages) will auto-deploy
5. Or manually deploy using the CLI tools

## Troubleshooting

**Build fails:**
- Ensure all dependencies are installed: `npm install`
- Check for TypeScript errors: `npm run build`
- Verify Node.js version (v20 or higher recommended)

**App doesn't work after deployment:**
- Check browser console for errors
- Ensure static files are served correctly
- Verify WASM file (`sql-wasm.wasm`) is accessible

**Database operations fail:**
- Check browser compatibility (needs WebAssembly support)
- Ensure IndexedDB is enabled in browser
- Check browser storage quota

## Next Steps

Choose your preferred deployment method above and follow the instructions. The easiest options are:
1. **Vercel** - Best for automatic deployments from git
2. **Netlify Drop** - Fastest manual deployment
3. **GitHub Pages** - Free and integrated with GitHub

Good luck with your deployment! 🚀
