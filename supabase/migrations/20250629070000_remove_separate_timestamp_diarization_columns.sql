/*
  # Remove timestamps and diarization columns from transcriptions table

  1. Changes
    - Remove timestamps column (data now stored in transcription_text as JSON)
    - Remove diarization column (data now stored in transcription_text as JSON)
    - All transcript data including timestamps and diarization is now stored in transcription_text as JSON from Eleven Labs API

  2. Background
    - Previously we stored timestamps and diarization in separate columns
    - Now we store the complete Eleven Labs API response as JSON in transcription_text
    - This provides access to all transcript data including segments, speakers, timestamps, audio events, etc.
*/

-- Remove the timestamps and diarization columns since everything is now in transcription_text as JSON
ALTER TABLE transcriptions 
DROP COLUMN IF EXISTS timestamps,
DROP COLUMN IF EXISTS diarization;

-- Add comment to document the change
COMMENT ON COLUMN transcriptions.transcription_text IS 'Complete JSON response from Eleven Labs API including text, timestamps, diarization, segments, speakers, and audio events';
