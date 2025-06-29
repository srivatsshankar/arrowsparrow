/*
  # Enhance transcriptions table for Eleven Labs client

  1. Changes
    - Add audio_events column to store tagged audio events (laughter, applause, etc.)
    - Add language_detected column to store automatically detected language
    - These fields support the enhanced features of the Eleven Labs client library
*/

-- Add new columns to transcriptions table
ALTER TABLE transcriptions 
ADD COLUMN IF NOT EXISTS audio_events jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS language_detected text DEFAULT 'eng';

-- Add comment for documentation
COMMENT ON COLUMN transcriptions.audio_events IS 'Tagged audio events like laughter, applause, etc. from Eleven Labs';
COMMENT ON COLUMN transcriptions.language_detected IS 'Automatically detected language from Eleven Labs transcription';
