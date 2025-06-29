# Supabase Deployment Guide

## Overview
This project uses Supabase for backend services including database, storage, and Edge functions.

## Prerequisites
- Node.js and npm installed
- Supabase CLI access (included in package.json)
- Access to your Supabase project

## Quick Deployment Commands

### Deploy Everything
```bash
npm run supabase:deploy-all
```

### Deploy Only Migrations
```bash
npm run supabase:push
```

### Deploy Only Edge Functions
```bash
npm run supabase:deploy
```

### Check Status
```bash
npm run supabase:status
npm run supabase:migration-list
```

## Manual Deployment Steps

### 1. Login to Supabase (One-time setup)
```bash
npx supabase login
```

### 2. Link to Your Project (One-time setup)
```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Push Database Migrations
```bash
npx supabase db push
```

### 4. Deploy Edge Functions
```bash
npx supabase functions deploy
```

## Project Structure

### Database Migrations
- Located in `supabase/migrations/`
- Applied in chronological order
- Each migration is timestamped

### Edge Functions
- Located in `supabase/functions/`
- `process-upload/` - Handles file processing with AI
- `_shared/` - Shared utilities like CORS

## Environment Variables
Make sure these are set in your environment:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Troubleshooting

### Migration Conflicts
If you get migration history conflicts:
```bash
npx supabase migration repair --status [applied|reverted] MIGRATION_ID
```

### Function Deployment Issues
Check function logs in Supabase Dashboard:
https://supabase.com/dashboard/project/YOUR_PROJECT_REF/functions

### Database Connection Issues
Verify your project is properly linked:
```bash
npx supabase projects list
npx supabase status
```

## Current Deployment Status
✅ **Migrations**: All 13 migrations successfully deployed
✅ **Edge Functions**: `process-upload` function deployed and active
✅ **Project Linked**: Arrow Sparrow project (ayftqqumezhbbwwzysnq)

## Function URLs
Your deployed functions are available at:
- `process-upload`: `https://ayftqqumezhbbwwzysnq.supabase.co/functions/v1/process-upload`

## Next Steps
1. Test your Edge function deployment
2. Verify database schema in Supabase Dashboard
3. Check function logs for any runtime issues
4. Update your app's environment variables if needed
