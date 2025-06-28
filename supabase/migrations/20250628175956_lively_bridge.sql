/*
  # StudyFlow Database Schema

  1. New Tables
    - `uploads`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `file_name` (text)
      - `file_type` (enum: audio, document)
      - `file_url` (text)
      - `file_size` (bigint)
      - `status` (enum: uploaded, processing, completed, error)
      - `error_message` (text, optional)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `transcriptions`
      - `id` (uuid, primary key)
      - `upload_id` (uuid, references uploads)
      - `transcription_text` (text)
      - `timestamps` (jsonb)
      - `diarization` (jsonb)
      - `created_at` (timestamptz)

    - `document_texts`
      - `id` (uuid, primary key)
      - `upload_id` (uuid, references uploads)
      - `extracted_text` (text)
      - `created_at` (timestamptz)

    - `summaries`
      - `id` (uuid, primary key)
      - `upload_id` (uuid, references uploads)
      - `summary_text` (text)
      - `created_at` (timestamptz)

    - `key_points`
      - `id` (uuid, primary key)
      - `upload_id` (uuid, references uploads)
      - `point_text` (text)
      - `importance_level` (integer)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to access their own data
*/

-- Create custom types
CREATE TYPE upload_file_type AS ENUM ('audio', 'document');
CREATE TYPE upload_status AS ENUM ('uploaded', 'processing', 'completed', 'error');

-- Create uploads table
CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_type upload_file_type NOT NULL,
  file_url text NOT NULL,
  file_size bigint NOT NULL,
  status upload_status DEFAULT 'uploaded',
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create transcriptions table
CREATE TABLE IF NOT EXISTS transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid REFERENCES uploads(id) ON DELETE CASCADE NOT NULL,
  transcription_text text NOT NULL,
  timestamps jsonb DEFAULT '{}',
  diarization jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create document_texts table
CREATE TABLE IF NOT EXISTS document_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid REFERENCES uploads(id) ON DELETE CASCADE NOT NULL,
  extracted_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create summaries table
CREATE TABLE IF NOT EXISTS summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid REFERENCES uploads(id) ON DELETE CASCADE NOT NULL,
  summary_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create key_points table
CREATE TABLE IF NOT EXISTS key_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid REFERENCES uploads(id) ON DELETE CASCADE NOT NULL,
  point_text text NOT NULL,
  importance_level integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_points ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for uploads
CREATE POLICY "Users can view own uploads"
  ON uploads
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own uploads"
  ON uploads
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own uploads"
  ON uploads
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create RLS policies for transcriptions
CREATE POLICY "Users can view own transcriptions"
  ON transcriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = transcriptions.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert transcriptions"
  ON transcriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = transcriptions.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

-- Create RLS policies for document_texts
CREATE POLICY "Users can view own document texts"
  ON document_texts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = document_texts.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert document texts"
  ON document_texts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = document_texts.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

-- Create RLS policies for summaries
CREATE POLICY "Users can view own summaries"
  ON summaries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = summaries.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert summaries"
  ON summaries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = summaries.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

-- Create RLS policies for key_points
CREATE POLICY "Users can view own key points"
  ON key_points
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = key_points.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert key points"
  ON key_points
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = key_points.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_transcriptions_upload_id ON transcriptions(upload_id);
CREATE INDEX IF NOT EXISTS idx_document_texts_upload_id ON document_texts(upload_id);
CREATE INDEX IF NOT EXISTS idx_summaries_upload_id ON summaries(upload_id);
CREATE INDEX IF NOT EXISTS idx_key_points_upload_id ON key_points(upload_id);

-- Add updated_at trigger for uploads table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_uploads_updated_at
    BEFORE UPDATE ON uploads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();