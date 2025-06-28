import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  RefreshControl,
  Modal,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Upload, 
  Mic, 
  FileText, 
  Square, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader,
  X,
  Plus
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database';

type Upload = Database['public']['Tables']['uploads']['Row'];
type UploadWithData = Upload & {
  transcriptions?: Array<{ transcription_text: string }>;
  document_texts?: Array<{ extracted_text: string }>;
  summaries?: Array<{ summary_text: string }>;
  key_points?: Array<{ point_text: string; importance_level: number }>;
};

export default function LibraryScreen() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<UploadWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchUploads = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('uploads')
        .select(`
          *,
          transcriptions (transcription_text),
          document_texts (extracted_text),
          summaries (summary_text),
          key_points (point_text, importance_level)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setUploads(data as UploadWithData[]);
    } catch (error) {
      console.error('Error fetching uploads:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUploads();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUploads();
  };

  const startRecording = async () => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Not Available', 'Audio recording is not available on web platform');
        return;
      }

      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Please grant microphone access to record audio');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    
    if (uri) {
      await handleFileUpload(uri, 'audio', 'recording.m4a');
    }
    
    setRecording(null);
    setShowUploadModal(false);
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        await handleFileUpload(file.uri, 'document', file.name);
        setShowUploadModal(false);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleFileUpload = async (uri: string, fileType: 'audio' | 'document', fileName: string) => {
    if (!user) return;

    setUploading(true);
    try {
      // Get file info
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileSize = blob.size;

      // Upload to Supabase Storage
      const fileExt = fileName.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(filePath, blob);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('uploads')
        .getPublicUrl(filePath);

      // Save to database
      const { data: dbData, error: dbError } = await supabase
        .from('uploads')
        .insert({
          user_id: user.id,
          file_name: fileName,
          file_type: fileType,
          file_url: publicUrl,
          file_size: fileSize,
          status: 'uploaded',
        })
        .select()
        .single();

      if (dbError) throw dbError;

      Alert.alert('Success', 'File uploaded successfully! Processing will begin shortly.');
      
      // Refresh the uploads list
      fetchUploads();
      
      // Trigger processing via edge function
      try {
        const processingResponse = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/process-upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uploadId: dbData.id,
            fileType: fileType,
            fileUrl: publicUrl,
          }),
        });

        if (!processingResponse.ok) {
          const errorData = await processingResponse.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Processing request failed:', errorData);
          
          // Update the upload status to error in the database
          await supabase
            .from('uploads')
            .update({ 
              status: 'error',
              error_message: errorData.error || 'Processing failed'
            })
            .eq('id', dbData.id);
          
          // Refresh to show the error status
          fetchUploads();
          
          Alert.alert(
            'Processing Error', 
            `File uploaded but processing failed: ${errorData.error || 'Unknown error'}. Please check your API configuration.`
          );
        } else {
          const responseData = await processingResponse.json();
          console.log('Processing started successfully:', responseData);
        }
      } catch (processingError) {
        console.error('Processing request error:', processingError);
        
        // Update the upload status to error in the database
        await supabase
          .from('uploads')
          .update({ 
            status: 'error',
            error_message: 'Failed to start processing'
          })
          .eq('id', dbData.id);
        
        // Refresh to show the error status
        fetchUploads();
        
        Alert.alert(
          'Processing Error', 
          'File uploaded but processing could not be started. Please check your connection and try again.'
        );
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Error', 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} color="#10B981" />;
      case 'processing':
        return <Loader size={16} color="#F59E0B" />;
      case 'error':
        return <AlertCircle size={16} color="#EF4444" />;
      default:
        return <Clock size={16} color="#6B7280" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing';
      case 'error':
        return 'Error';
      default:
        return 'Uploaded';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Loader size={32} color="#3B82F6" />
        <Text style={styles.loadingText}>Loading your library...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.title}>Your Library</Text>
              <Text style={styles.subtitle}>
                {uploads.length} item{uploads.length !== 1 ? 's' : ''} in your collection
              </Text>
            </View>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => setShowUploadModal(true)}
              activeOpacity={0.8}
            >
              <Plus size={20} color="#FFFFFF" />
              <Text style={styles.uploadButtonText}>Upload</Text>
            </TouchableOpacity>
          </View>
        </View>

        {uploading && (
          <View style={styles.uploadingContainer}>
            <Loader size={20} color="#3B82F6" />
            <Text style={styles.uploadingText}>Uploading and processing...</Text>
          </View>
        )}

        {uploads.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={64} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No content yet</Text>
            <Text style={styles.emptyDescription}>
              Upload your first audio recording or document to get started with AI-powered summaries and insights
            </Text>
            <TouchableOpacity
              style={styles.emptyUploadButton}
              onPress={() => setShowUploadModal(true)}
              activeOpacity={0.8}
            >
              <Upload size={20} color="#3B82F6" />
              <Text style={styles.emptyUploadButtonText}>Upload Content</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {uploads.map((upload) => (
              <TouchableOpacity key={upload.id} style={styles.uploadCard} activeOpacity={0.7}>
                <View style={styles.cardHeader}>
                  <View style={styles.fileInfo}>
                    <View style={styles.fileIcon}>
                      {upload.file_type === 'audio' ? (
                        <Mic size={20} color="#3B82F6" />
                      ) : (
                        <FileText size={20} color="#3B82F6" />
                      )}
                    </View>
                    <View style={styles.fileDetails}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {upload.file_name}
                      </Text>
                      <Text style={styles.fileMetadata}>
                        {formatFileSize(upload.file_size)} • {formatDate(upload.created_at)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.statusContainer}>
                    {getStatusIcon(upload.status)}
                    <Text style={[styles.statusText, { 
                      color: upload.status === 'completed' ? '#10B981' : 
                             upload.status === 'error' ? '#EF4444' : '#F59E0B' 
                    }]}>
                      {getStatusText(upload.status)}
                    </Text>
                  </View>
                </View>

                {upload.status === 'completed' && (
                  <View style={styles.cardContent}>
                    {upload.summaries && upload.summaries.length > 0 && (
                      <View style={styles.contentSection}>
                        <Text style={styles.sectionTitle}>Summary</Text>
                        <Text style={styles.summaryText} numberOfLines={3}>
                          {upload.summaries[0].summary_text}
                        </Text>
                      </View>
                    )}

                    {upload.key_points && upload.key_points.length > 0 && (
                      <View style={styles.contentSection}>
                        <Text style={styles.sectionTitle}>Key Points</Text>
                        {upload.key_points.slice(0, 3).map((point, index) => (
                          <View key={index} style={styles.keyPoint}>
                            <Text style={styles.keyPointBullet}>•</Text>
                            <Text style={styles.keyPointText} numberOfLines={2}>
                              {point.point_text}
                            </Text>
                          </View>
                        ))}
                        {upload.key_points.length > 3 && (
                          <Text style={styles.morePoints}>
                            +{upload.key_points.length - 3} more points
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {upload.status === 'error' && upload.error_message && (
                  <View style={styles.errorSection}>
                    <Text style={styles.errorText}>{upload.error_message}</Text>
                    <Text style={styles.errorHint}>
                      This usually indicates missing API configuration. Please check that your Eleven Labs and Google Gemini API keys are properly configured.
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Upload Modal */}
      <Modal
        visible={showUploadModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowUploadModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upload Content</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowUploadModal(false)}
                activeOpacity={0.7}
              >
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Choose how you'd like to add content to your library
            </Text>

            <View style={styles.uploadOptions}>
              <TouchableOpacity
                style={[styles.uploadOption, isRecording && styles.recordingOption]}
                onPress={isRecording ? stopRecording : startRecording}
                disabled={Platform.OS === 'web'}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIcon, isRecording && styles.recordingIcon]}>
                  {isRecording ? (
                    <Square size={24} color="#FFFFFF" />
                  ) : (
                    <Mic size={24} color={Platform.OS === 'web' ? '#9CA3AF' : '#3B82F6'} />
                  )}
                </View>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionTitle, Platform.OS === 'web' && styles.disabledText]}>
                    {isRecording ? 'Stop Recording' : 'Record Audio'}
                  </Text>
                  <Text style={[styles.optionDescription, Platform.OS === 'web' && styles.disabledText]}>
                    {Platform.OS === 'web' 
                      ? 'Not available on web'
                      : isRecording 
                        ? 'Tap to stop and upload'
                        : 'Record lectures, meetings, or conversations'
                    }
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.uploadOption}
                onPress={pickDocument}
                disabled={uploading}
                activeOpacity={0.8}
              >
                <View style={styles.optionIcon}>
                  <FileText size={24} color="#3B82F6" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Upload Document</Text>
                  <Text style={styles.optionDescription}>
                    Upload PDF or Word documents for text extraction
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoTitle}>How it works</Text>
              <View style={styles.infoItem}>
                <Text style={styles.infoNumber}>1</Text>
                <Text style={styles.infoText}>Upload your content</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoNumber}>2</Text>
                <Text style={styles.infoText}>AI processes and extracts insights</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoNumber}>3</Text>
                <Text style={styles.infoText}>Get summaries and key points</Text>
              </View>
            </View>

            <View style={styles.configNote}>
              <AlertCircle size={16} color="#F59E0B" />
              <Text style={styles.configNoteText}>
                Note: AI processing requires API keys to be configured in your Supabase project settings.
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  uploadButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#EBF4FF',
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 12,
    gap: 12,
  },
  uploadingText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 24,
    marginBottom: 12,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  emptyUploadButton: {
    backgroundColor: '#EBF4FF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  emptyUploadButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: 24,
    gap: 16,
  },
  uploadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fileIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  fileMetadata: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardContent: {
    gap: 16,
  },
  contentSection: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  summaryText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  keyPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  keyPointBullet: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
    marginTop: 2,
  },
  keyPointText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  morePoints: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 4,
  },
  errorSection: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    marginBottom: 4,
  },
  errorHint: {
    fontSize: 12,
    color: '#7F1D1D',
    fontStyle: 'italic',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
  },
  uploadOptions: {
    gap: 16,
    marginBottom: 32,
  },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recordingOption: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  optionIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#EBF4FF',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  recordingIcon: {
    backgroundColor: '#EF4444',
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  disabledText: {
    color: '#9CA3AF',
  },
  infoSection: {
    backgroundColor: '#F9FAFB',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoNumber: {
    width: 24,
    height: 24,
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 24,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
  },
  configNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  configNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },
});