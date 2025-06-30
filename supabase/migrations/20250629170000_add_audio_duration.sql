/*
  # Add Audio Duration Field

  1. Changes
    - Add `duration` field to uploads table for storing audio duration in seconds
    - Only applies to audio files (file_type = 'audio')
    - Duration stored as numeric (can handle fractional seconds)

  2. Notes
    - Duration will be calculated during upload for audio files
    - Duration will be null for document files
    - Existing records will have null duration initially
*/

-- Add duration column to uploads table
ALTER TABLE uploads 
ADD COLUMN duration numeric;

-- Add comment to document the field
COMMENT ON COLUMN uploads.duration IS 'Duration in seconds for audio files, null for documents';

-- Create index for faster queries on audio files with duration
CREATE INDEX idx_uploads_audio_duration ON uploads(duration) WHERE file_type = 'audio';
