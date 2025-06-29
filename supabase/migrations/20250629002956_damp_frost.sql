/*
  # Storage Configuration for File Uploads

  1. Storage Bucket
    - Creates 'uploads' bucket for user file storage
    - 50MB file size limit
    - Supports audio and document file types

  2. Manual Policy Setup Required
    After this migration runs, you must manually configure storage policies
    in the Supabase Dashboard under Storage > Policies.

    Required policies for the 'uploads' bucket:

    a) INSERT Policy: "Users can upload files to their own folder"
       - Policy name: Users can upload files to their own folder
       - Allowed operation: INSERT
       - Target roles: authenticated
       - USING expression: (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text)

    b) SELECT Policy: "Users can read their own uploaded files"
       - Policy name: Users can read their own uploaded files
       - Allowed operation: SELECT
       - Target roles: authenticated
       - USING expression: (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text)

    c) UPDATE Policy: "Users can update their own uploaded files"
       - Policy name: Users can update their own uploaded files
       - Allowed operation: UPDATE
       - Target roles: authenticated
       - USING expression: (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text)

    d) DELETE Policy: "Users can delete their own uploaded files"
       - Policy name: Users can delete their own uploaded files
       - Allowed operation: DELETE
       - Target roles: authenticated
       - USING expression: (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text)

  3. Security
    - Row Level Security is enabled by default on storage.objects
    - Users can only access files in their own folder (user_id/*)
*/

-- Create the uploads bucket (ignore if already exists)
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
)
ON CONFLICT (id) DO NOTHING;

-- Note: Storage policies must be configured manually in the Supabase Dashboard
-- due to permission constraints in SQL migrations. See the comment block above
-- for detailed instructions on setting up the required policies.