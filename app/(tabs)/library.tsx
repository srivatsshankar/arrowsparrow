import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database';
import { FileText, Mic, Clock, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Loader } from 'lucide-react-native';

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
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Your Library</Text>
        <Text style={styles.subtitle}>
          {uploads.length} item{uploads.length !== 1 ? 's' : ''} in your collection
        </Text>
      </View>

      {uploads.length === 0 ? (
        <View style={styles.emptyState}>
          <FileText size={48} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No content yet</Text>
          <Text style={styles.emptyDescription}>
            Upload your first audio recording or document to get started
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {uploads.map((upload) => (
            <TouchableOpacity key={upload.id} style={styles.uploadCard}>
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
                  <Text style={[styles.statusText, { color: upload.status === 'completed' ? '#10B981' : upload.status === 'error' ? '#EF4444' : '#F59E0B' }]}>
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
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
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
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
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
    gap: 4,
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
  },
});