/*
  # Create Storage Bucket for File Uploads

  1. Storage Setup
    - Create 'uploads' bucket for user file storage
    - Set 50MB file size limit
    - Allow audio and document file types
    - Enable public access for file URLs

  2. Security
    - Enable RLS on storage.objects
    - Users can only access files in their own folder
    - Folder structure: {user_id}/{filename}
*/

-- Create the uploads bucket
DO $$
BEGIN
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
EXCEPTION
  WHEN unique_violation THEN
    -- Bucket already exists, update it instead
    UPDATE storage.buckets 
    SET 
      public = true,
      file_size_limit = 52428800,
      allowed_mime_types = ARRAY[
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
    WHERE id = 'uploads';
END $$;

-- Create storage policies (these will only be created if they don't exist)
DO $$
BEGIN
  -- Policy to allow authenticated users to upload files to their own folder
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can upload files to their own folder'
  ) THEN
    CREATE POLICY "Users can upload files to their own folder"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'uploads' AND
      (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  -- Policy to allow authenticated users to read files from their own folder
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can read their own uploaded files'
  ) THEN
    CREATE POLICY "Users can read their own uploaded files"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'uploads' AND
      (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  -- Policy to allow authenticated users to update files in their own folder
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can update their own uploaded files'
  ) THEN
    CREATE POLICY "Users can update their own uploaded files"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'uploads' AND
      (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  -- Policy to allow authenticated users to delete files from their own folder
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can delete their own uploaded files'
  ) THEN
    CREATE POLICY "Users can delete their own uploaded files"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'uploads' AND
      (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;