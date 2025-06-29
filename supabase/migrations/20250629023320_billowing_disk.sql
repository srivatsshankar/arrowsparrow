/*
  # Add DELETE policy for uploads table

  1. Security
    - Add RLS policy to allow authenticated users to delete their own uploads
    - Ensures users can only delete uploads they own (user_id matches auth.uid())

  This migration adds the missing DELETE policy that was preventing users from 
  deleting their uploaded files through the application.
*/

-- Add DELETE policy for uploads table
CREATE POLICY "Users can delete own uploads"
  ON uploads
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);