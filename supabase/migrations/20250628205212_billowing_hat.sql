/*
  # Create uploads storage bucket

  1. New Storage Bucket
    - Create 'uploads' bucket for file storage
    - Set as public bucket to allow file access
    - Configure appropriate policies for authenticated users

  2. Security
    - Enable RLS on storage objects
    - Add policies for authenticated users to upload their own files
    - Add policies for users to read their own uploaded files
*/

-- Create the uploads bucket
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

-- Enable RLS on storage objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

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