# Folder Functionality Documentation

This document outlines the folder functionality that has been implemented in the Arrow Sparrow app.

## Overview

The folder system allows users to organize their uploads (audio recordings, documents, etc.) into folders for better management and categorization.

## Database Schema

### Tables Added

1. **folders** table:
   - `id` (UUID, primary key)
   - `user_id` (UUID, foreign key to auth.users)
   - `name` (text, not null)
   - `description` (text, optional)
   - `color` (text, optional - for UI theming)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

2. **upload_folders** table:
   - `id` (UUID, primary key)
   - `upload_id` (UUID, foreign key to uploads)
   - `folder_id` (UUID, foreign key to folders)
   - `created_at` (timestamp)

### Row Level Security (RLS)

- Both tables have RLS enabled
- Users can only access their own folders and folder assignments
- Policies ensure proper data isolation between users

## UI/UX Features

### 1. Folders Management Screen (`/folders`)
- **Location**: Accessible from folder icon in the top bar of the main library screen
- **Features**:
  - View all user's folders
  - Create new folders (name + description)
  - Edit existing folders
  - Delete folders (with confirmation)
  - Shows upload count for each folder
  - Empty state with call-to-action

### 2. Folder Detail Screen (`/folder-detail/[id]`)
- **Location**: Accessible by tapping on a folder in the folders list
- **Features**:
  - View all uploads in a specific folder
  - Remove uploads from the folder
  - See folder details (name, description, upload count)
  - Navigate back to folders list

### 3. Upload Modal Enhancement
- **Location**: Main library screen upload modal
- **Features**:
  - Folder selection dropdown during upload
  - Option to assign upload to a folder immediately
  - "No folder" option for unorganized uploads

### 4. Detail Screen Folder Management
- **Location**: Individual upload detail screen
- **Features**:
  - View current folder assignment
  - Change folder assignment via dropdown menu
  - Remove from current folder
  - Assign to multiple folders (if needed)
  - Modal interface for folder selection

### 5. Unorganized Uploads Screen (`/unorganized-uploads`)
- **Location**: Shows uploads not assigned to any folder
- **Features**:
  - View all uploads without folder assignment
  - Bulk folder assignment capabilities
  - Quick organization tool

## User Workflows

### Creating a Folder
1. Navigate to main library screen
2. Tap folder icon in top bar
3. Tap "Create Folder" button
4. Enter folder name and optional description
5. Tap "Create" to save

### Organizing Uploads During Upload
1. Start upload process (recording or file selection)
2. In upload modal, select desired folder from dropdown
3. Complete upload - file is automatically assigned to folder

### Organizing Existing Uploads
1. Navigate to upload detail screen
2. Tap the three-dot menu
3. Select "Manage Folders"
4. Choose folders to assign upload to
5. Save changes

### Viewing Folder Contents
1. Navigate to folders screen
2. Tap on desired folder
3. View all uploads in that folder
4. Optionally remove uploads from folder

### Managing Unorganized Content
1. Navigate to folders screen
2. Tap "Unorganized Uploads" (if available)
3. Select uploads to organize
4. Assign to folders as needed

## Technical Implementation

### Key Files Modified/Created

1. **Database Migration**: `supabase/migrations/20250629190000_add_folders.sql`
2. **Type Definitions**: `types/database.ts` (updated)
3. **Screens**:
   - `app/folders.tsx` (new)
   - `app/folder-detail.tsx` (new)
   - `app/unorganized-uploads.tsx` (new)
   - `app/detail.tsx` (enhanced)
   - `app/index.tsx` (enhanced)
4. **Context**: `contexts/RecordingContext.tsx` (enhanced)

### Context Changes

The `RecordingContext` has been enhanced to support:
- Folder selection during recording
- Folder assignment during upload
- Folder data management

### State Management

- Folder data is fetched from Supabase in real-time
- Local state manages folder selections and modal states
- Optimistic updates for better UX

## Error Handling

- Network error handling for folder operations
- Validation for folder names and descriptions
- Graceful fallbacks for missing folder data
- User-friendly error messages

## Future Enhancements

Potential areas for future improvement:
1. Folder sharing capabilities
2. Nested folder support
3. Drag-and-drop folder organization
4. Folder color coding and icons
5. Advanced search within folders
6. Folder templates or suggestions
7. Bulk folder operations
8. Export folder contents

## Testing Recommendations

1. Test folder CRUD operations
2. Test upload assignment during recording/upload
3. Test folder management from detail screen
4. Test unorganized uploads workflow
5. Verify RLS policies work correctly
6. Test error scenarios (network issues, invalid data)
7. Test with multiple users to ensure data isolation

## Notes

- All folder operations require user authentication
- Deleting a folder does not delete the uploads, only removes the associations
- Uploads can exist without folder assignments (unorganized)
- The system supports many-to-many relationships (uploads can be in multiple folders if needed)
