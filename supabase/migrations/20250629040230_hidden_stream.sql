/*
  # Storage Bucket Setup

  1. Storage Bucket
    - Create 'uploads' bucket for user file storage
    - Configure file size limits and allowed MIME types
    - Enable public access for file serving

  2. Important Note
    Storage policies for the storage.objects table cannot be created via SQL migrations
    due to permission constraints. These must be configured manually in the Supabase Dashboard.

  ## Manual Setup Required After Migration

  After running this migration, complete the storage setup in your Supabase Dashboard:

  1. Go to Storage > Policies in your Supabase Dashboard
  2. Create the following policies for the 'uploads' bucket:

  ### INSERT Policy: "Users can upload files to their own folder"
  - Target roles: authenticated
  - Policy definition: `bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text`

  ### SELECT Policy: "Users can read their own uploaded files"  
  - Target roles: authenticated
  - Policy definition: `bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text`

  ### UPDATE Policy: "Users can update their own uploaded files"
  - Target roles: authenticated  
  - Policy definition: `bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text`

  ### DELETE Policy: "Users can delete their own uploaded files"
  - Target roles: authenticated
  - Policy definition: `bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text`
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