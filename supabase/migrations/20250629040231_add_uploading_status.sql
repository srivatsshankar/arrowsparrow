/*
  # Add uploading status to upload_status enum

  1. Changes
    - Add 'uploading' status to the upload_status enum type
    - This allows files to show uploading status before they're fully uploaded
*/

-- Add 'uploading' to the upload_status enum
ALTER TYPE upload_status ADD VALUE 'uploading' BEFORE 'uploaded';
