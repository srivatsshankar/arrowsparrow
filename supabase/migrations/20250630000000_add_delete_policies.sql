-- Add missing DELETE policies for related tables to support cascade deletion
-- This fixes multi-delete functionality by allowing RLS to permit cascade deletes

-- Add DELETE policy for transcriptions
CREATE POLICY "Users can delete own transcriptions"
  ON transcriptions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = transcriptions.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

-- Add DELETE policy for document_texts
CREATE POLICY "Users can delete own document_texts"
  ON document_texts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = document_texts.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

-- Add DELETE policy for summaries
CREATE POLICY "Users can delete own summaries"
  ON summaries
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = summaries.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );

-- Add DELETE policy for key_points
CREATE POLICY "Users can delete own key_points"
  ON key_points
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uploads 
      WHERE uploads.id = key_points.upload_id 
      AND uploads.user_id = auth.uid()
    )
  );
