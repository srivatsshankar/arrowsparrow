/*
  # Add Generated Name Field

  1. Changes
    - Add `generated_name` field to uploads table for storing AI-generated content names
    - Add `original_filename` field to preserve the original uploaded filename
    - Update existing records to use file_name as generated_name for consistency

  2. Notes
    - generated_name will be the primary display name (AI-generated)
    - original_filename preserves the original upload filename
    - file_name remains for backward compatibility but will be deprecated
*/

-- Add generated_name column for AI-generated content names
ALTER TABLE uploads 
ADD COLUMN generated_name text;

-- Add original_filename column to preserve original filenames
ALTER TABLE uploads 
ADD COLUMN original_filename text;

-- Update existing records to use file_name as generated_name for consistency
UPDATE uploads 
SET generated_name = file_name,
    original_filename = file_name
WHERE generated_name IS NULL;

-- Add comments to document the fields
COMMENT ON COLUMN uploads.generated_name IS 'AI-generated descriptive name for the content';
COMMENT ON COLUMN uploads.original_filename IS 'Original filename from upload';

-- Create index for faster searches on generated names
CREATE INDEX idx_uploads_generated_name ON uploads(generated_name);
