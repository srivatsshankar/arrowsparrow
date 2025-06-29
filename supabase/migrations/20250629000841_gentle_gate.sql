/*
  # Storage Bucket Setup

  1. Storage Bucket
    - Create 'uploads' bucket for user file storage
    - Configure file size limits and allowed MIME types
    - Enable public access for file serving

  Note: Storage policies (RLS) for the storage.objects table are managed 
  through the Supabase Dashboard or Storage API, not SQL migrations.
  
  To complete the setup:
  1. Go to Storage > Policies in your Supabase Dashboard
  2. Create policies for the 'uploads' bucket with these rules:
     - INSERT: Allow authenticated users to upload to their own folder
     - SELECT: Allow authenticated users to read their own files  
     - UPDATE: Allow authenticated users to update their own files
     - DELETE: Allow authenticated users to delete their own files
  
  Policy conditions should check:
  - bucket_id = 'uploads'
  - (storage.foldername(name))[1] = auth.uid()::text
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