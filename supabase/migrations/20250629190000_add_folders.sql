/*
  # Add Folders Functionality

  1. New Tables
    - `folders` - stores user-created folders
    - `upload_folders` - many-to-many relationship between uploads and folders

  2. Changes
    - Folders can contain multiple uploads
    - Uploads can be in multiple folders (tags-like behavior)
    - Users can organize their content into folders
*/

-- Create folders table
CREATE TABLE folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#3B82F6', -- Default blue color
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create upload_folders junction table for many-to-many relationship
CREATE TABLE upload_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid REFERENCES uploads(id) ON DELETE CASCADE NOT NULL,
  folder_id uuid REFERENCES folders(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(upload_id, folder_id) -- Prevent duplicate associations
);

-- Add indexes for better performance
CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE INDEX idx_folders_created_at ON folders(created_at);
CREATE INDEX idx_upload_folders_upload_id ON upload_folders(upload_id);
CREATE INDEX idx_upload_folders_folder_id ON upload_folders(folder_id);

-- Add RLS policies for folders
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own folders" ON folders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own folders" ON folders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders" ON folders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders" ON folders
  FOR DELETE USING (auth.uid() = user_id);

-- Add RLS policies for upload_folders
ALTER TABLE upload_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own upload folder associations" ON upload_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = upload_folders.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own upload folder associations" ON upload_folders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = upload_folders.upload_id 
      AND uploads.user_id = auth.uid()
    ) AND
    EXISTS (
      SELECT 1 FROM folders 
      WHERE folders.id = upload_folders.folder_id 
      AND folders.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own upload folder associations" ON upload_folders
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = upload_folders.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_folders_updated_at
  BEFORE UPDATE ON folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
