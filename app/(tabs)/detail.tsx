import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database';
import { ArrowLeft, FileText, Mic, Clock, User, Star, MessageSquare, List, Trash2, MoveVertical as MoreVertical, X } from 'lucide-react-native';

type Upload = Database['public']['Tables']['uploads']['Row'];
type UploadWithData = Upload & {
  transcriptions?: Array<{ transcription_text: string; timestamps?: any; diarization?: any }>;
  document_texts?: Array<{ extracted_text: string }>;
  summaries?: Array<{ summary_text: string }>;
  key_points?: Array<{ point_text: string; importance_level: number }>;
};

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [upload, setUpload] = useState<UploadWithData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'summary' | 'keypoints'>('content');

  useEffect(() => {
    if (id && user) {
      fetchUploadDetail();
    }
  }, [id, user]);

  const fetchUploadDetail = async () => {
    if (!user || !id) return;

    try {
      const { data, error } = await supabase
        .from('uploads')
        .select(`
          *,
          transcriptions (transcription_text, timestamps, diarization),
          document_texts (extracted_text),
          summaries (summary_text),
          key_points (point_text, importance_level)
        `)
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching upload detail:', error);
        return;
      }

      setUpload(data as UploadWithData);
    } catch (error) {
      console.error('Error fetching upload detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!upload || !user) return;

    setDeleting(true);
    try {
      // Delete the file from storage first
      const fileName = upload.file_url.split('/').pop();
      if (fileName) {
        const filePath = `${user.id}/${fileName}`;
        const { error: storageError } = await supabase.storage
          .from('uploads')
          .remove([filePath]);

        if (storageError) {
          console.error('Error deleting file from storage:', storageError);
          // Continue with database deletion even if storage deletion fails
        }
      }

      // Delete the upload record (this will cascade delete related records)
      const { error: dbError } = await supabase
        .from('uploads')
        .delete()
        .eq('id', upload.id)
        .eq('user_id', user.id);

      if (dbError) {
        throw dbError;
      }

      // Navigate back to library
      router.back();
      
    } catch (error) {
      console.error('Error deleting upload:', error);
      Alert.alert('Error', 'Failed to delete the item. Please try again.');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getContentText = () => {
    if (!upload) return '';
    
    if (upload.file_type === 'audio' && upload.transcriptions && upload.transcriptions.length > 0) {
      return upload.transcriptions[0].transcription_text;
    } else if (upload.file_type === 'document' && upload.document_texts && upload.document_texts.length > 0) {
      return upload.document_texts[0].extracted_text;
    }
    
    return 'No content available';
  };

  const getSummaryText = () => {
    if (!upload || !upload.summaries || upload.summaries.length === 0) {
      return 'No summary available';
    }
    return upload.summaries[0].summary_text;
  };

  const getKeyPoints = () => {
    if (!upload || !upload.key_points || upload.key_points.length === 0) {
      return [];
    }
    return upload.key_points.sort((a, b) => b.importance_level - a.importance_level);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading content...</Text>
      </View>
    );
  }

  if (!upload) {
    return (
      <View style={styles.errorContainer}>
        <FileText size={48} color="#9CA3AF" />
        <Text style={styles.errorTitle}>Content not found</Text>
        <Text style={styles.errorDescription}>
          The requested content could not be found or you don't have permission to view it.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backIconButton} 
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {upload.file_name}
          </Text>
          <Text style={styles.headerSubtitle}>
            {formatFileSize(upload.file_size)} • {formatDate(upload.created_at)}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.optionsButton} 
          onPress={() => setShowOptionsModal(true)}
          activeOpacity={0.7}
        >
          <MoreVertical size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* File Info Card */}
      <View style={styles.fileInfoCard}>
        <View style={styles.fileIconContainer}>
          {upload.file_type === 'audio' ? (
            <Mic size={24} color="#3B82F6" />
          ) : (
            <FileText size={24} color="#3B82F6" />
          )}
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileType}>
            {upload.file_type === 'audio' ? 'Audio Recording' : 'Document'}
          </Text>
          <View style={styles.statusBadge}>
            <View style={[
              styles.statusDot, 
              { backgroundColor: upload.status === 'completed' ? '#10B981' : '#F59E0B' }
            ]} />
            <Text style={[
              styles.statusText,
              { color: upload.status === 'completed' ? '#10B981' : '#F59E0B' }
            ]}>
              {upload.status === 'completed' ? 'Processed' : 'Processing'}
            </Text>
          </View>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'content' && styles.activeTab]}
          onPress={() => setActiveTab('content')}
          activeOpacity={0.7}
        >
          <MessageSquare size={16} color={activeTab === 'content' ? '#3B82F6' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'content' && styles.activeTabText]}>
            {upload.file_type === 'audio' ? 'Transcription' : 'Text'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'summary' && styles.activeTab]}
          onPress={() => setActiveTab('summary')}
          activeOpacity={0.7}
        >
          <FileText size={16} color={activeTab === 'summary' ? '#3B82F6' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'summary' && styles.activeTabText]}>
            Summary
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'keypoints' && styles.activeTab]}
          onPress={() => setActiveTab('keypoints')}
          activeOpacity={0.7}
        >
          <List size={16} color={activeTab === 'keypoints' ? '#3B82F6' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'keypoints' && styles.activeTabText]}>
            Key Points
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {activeTab === 'content' && (
          <View style={styles.contentSection}>
            <Text style={styles.contentText}>
              {getContentText()}
            </Text>
          </View>
        )}

        {activeTab === 'summary' && (
          <View style={styles.contentSection}>
            <Text style={styles.contentText}>
              {getSummaryText()}
            </Text>
          </View>
        )}

        {activeTab === 'keypoints' && (
          <View style={styles.contentSection}>
            {getKeyPoints().length > 0 ? (
              getKeyPoints().map((point, index) => (
                <View key={index} style={styles.keyPointItem}>
                  <View style={styles.keyPointHeader}>
                    <View style={styles.keyPointNumber}>
                      <Text style={styles.keyPointNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.importanceContainer}>
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={12}
                          color={i < point.importance_level ? '#F59E0B' : '#E5E7EB'}
                          fill={i < point.importance_level ? '#F59E0B' : 'transparent'}
                        />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.keyPointText}>{point.point_text}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <List size={32} color="#9CA3AF" />
                <Text style={styles.emptyStateText}>No key points available</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Options Modal */}
      <Modal
        visible={showOptionsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsModal}>
            <View style={styles.optionsHeader}>
              <Text style={styles.optionsTitle}>Options</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowOptionsModal(false)}
                activeOpacity={0.7}
              >
                <X size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                setShowOptionsModal(false);
                setShowDeleteModal(true);
              }}
              activeOpacity={0.7}
            >
              <Trash2 size={20} color="#EF4444" />
              <Text style={styles.deleteOptionText}>Delete Item</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModal}>
            <View style={styles.deleteIconContainer}>
              <Trash2 size={32} color="#EF4444" />
            </View>
            
            <Text style={styles.deleteTitle}>Delete Item</Text>
            <Text style={styles.deleteMessage}>
              Are you sure you want to delete "{upload.file_name}"? This action cannot be undone and will remove all associated content including transcriptions, summaries, and key points.
            </Text>
            
            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
                onPress={handleDelete}
                disabled={deleting}
                activeOpacity={0.7}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.deleteButtonText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  errorDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backIconButton: {
    padding: 8,
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  optionsButton: {
    padding: 8,
    marginLeft: 12,
  },
  fileInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 24,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    backgroundColor: '#EBF4FF',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  fileInfo: {
    flex: 1,
  },
  fileType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#EBF4FF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  contentContainer: {
    flex: 1,
    margin: 24,
    marginTop: 16,
  },
  contentSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  contentText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
  },
  keyPointItem: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  keyPointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  keyPointNumber: {
    width: 24,
    height: 24,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPointNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  importanceContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  keyPointText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 12,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 24,
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  optionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  optionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 12,
  },
  deleteOptionText: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '500',
  },
  deleteModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  deleteIconContainer: {
    width: 64,
    height: 64,
    backgroundColor: '#FEF2F2',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  deleteTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  deleteMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});