/*
  # Storage Bucket Configuration

  1. Storage Setup
    - Create uploads bucket for file storage
    - Configure file size limits and allowed MIME types
    - Set bucket to public for direct file access

  Note: RLS policies for storage.objects are managed by Supabase automatically
  and don't need to be explicitly created in migrations.
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