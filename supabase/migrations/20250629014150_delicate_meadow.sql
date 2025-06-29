/*
  # Storage Configuration for File Uploads

  1. Storage Bucket
    - Create 'uploads' bucket for user file storage
    - Configure file size limits and allowed MIME types
    - Enable public access for file serving

  2. Security Policies
    - Users can only access files in their own folder
    - Folder structure: uploads/{user_id}/{filename}
    - Full CRUD permissions for authenticated users on their own files
*/

-- Create the uploads bucket using Supabase's storage functions
DO $$
BEGIN
  -- Check if bucket already exists
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'uploads'
  ) THEN
    -- Create the bucket
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'uploads',
      'uploads', 
      true,
      52428800, -- 50MB limit
      ARRAY[
        'audio/mpeg',
        'audio/mp4', 
        'audio/wav',
        'audio/m4a',
        'audio/webm',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ]
    );
  END IF;
END $$;

-- Storage policies for user file access
-- Note: These policies work on the storage.objects table through Supabase's RLS system

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can upload files to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own uploaded files" ON storage.objects;  
DROP POLICY IF EXISTS "Users can update their own uploaded files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own uploaded files" ON storage.objects;

-- Policy to allow authenticated users to upload files to their own folder
CREATE POLICY "Users can upload files to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy to allow authenticated users to read files from their own folder  
CREATE POLICY "Users can read their own uploaded files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy to allow authenticated users to update files in their own folder
CREATE POLICY "Users can update their own uploaded files" 
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy to allow authenticated users to delete files from their own folder
CREATE POLICY "Users can delete their own uploaded files"
ON storage.objects
FOR DELETE  
TO authenticated
USING (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);