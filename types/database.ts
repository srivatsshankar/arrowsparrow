export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      uploads: {
        Row: {
          id: string;
          user_id: string;
          file_name: string;
          file_type: 'audio' | 'document';
          file_url: string;
          file_size: number;
          duration?: number | null;
          generated_name?: string | null;
          original_filename?: string | null;
          status: 'uploaded' | 'processing' | 'completed' | 'error';
          error_message?: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          file_name: string;
          file_type: 'audio' | 'document';
          file_url: string;
          file_size: number;
          duration?: number | null;
          generated_name?: string | null;
          original_filename?: string | null;
          status?: 'uploaded' | 'processing' | 'completed' | 'error';
          error_message?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          file_name?: string;
          file_type?: 'audio' | 'document';
          file_url?: string;
          file_size?: number;
          duration?: number | null;
          generated_name?: string | null;
          original_filename?: string | null;
          status?: 'uploaded' | 'processing' | 'completed' | 'error';
          error_message?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      transcriptions: {
        Row: {
          id: string;
          upload_id: string;
          transcription_text: string;
          timestamps: any;
          diarization: any;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          transcription_text: string;
          timestamps: any;
          diarization: any;
          created_at?: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          transcription_text?: string;
          timestamps?: any;
          diarization?: any;
          created_at?: string;
        };
      };
      document_texts: {
        Row: {
          id: string;
          upload_id: string;
          extracted_text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          extracted_text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          extracted_text?: string;
          created_at?: string;
        };
      };
      summaries: {
        Row: {
          id: string;
          upload_id: string;
          summary_text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          summary_text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          summary_text?: string;
          created_at?: string;
        };
      };
      key_points: {
        Row: {
          id: string;
          upload_id: string;
          point_text: string;
          importance_level: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          point_text: string;
          importance_level: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          point_text?: string;
          importance_level?: number;
          created_at?: string;
        };
      };
      folders: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description?: string | null;
          color: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          color?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          color?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      upload_folders: {
        Row: {
          id: string;
          upload_id: string;
          folder_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          folder_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          folder_id?: string;
          created_at?: string;
        };
      };
    };
  };
}