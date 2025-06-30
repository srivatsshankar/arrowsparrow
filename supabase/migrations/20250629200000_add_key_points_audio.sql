-- Add audio file fields to key_points table
ALTER TABLE key_points ADD COLUMN audio_file_url TEXT;
ALTER TABLE key_points ADD COLUMN audio_duration INTEGER; -- duration in seconds
