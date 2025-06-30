import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  Modal,
  Animated,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { 
  ArrowLeft, 
  Mic, 
  FileText, 
  Play, 
  Pause, 
  Loader, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Plus,
  X,
  FolderPlus,
  Folder
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

type Folder = Database['public']['Tables']['folders']['Row'];

export default function UnorganizedUploadsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  
  const {
    currentUpload: globalCurrentUpload,
    isPlaying: globalIsPlaying,
    isLoading: globalAudioLoading,
    playAudio,
    togglePlayback: globalTogglePlayback,
  } = useAudioPlayer();

  const [uploads, setUploads] = useState<UploadWithData[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [selectedUpload, setSelectedUpload] = useState<UploadWithData | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  
  // Animation values for modal
  const [modalOpacity] = useState(new Animated.Value(0));
  const [modalTranslateY] = useState(new Animated.Value(300));

  const styles = createStyles(colors);

  // Handle modal animations
  useEffect(() => {
    if (showFolderModal) {
      Animated.parallel([
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(modalTranslateY, {
          toValue: 0,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showFolderModal]);

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: 300,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowFolderModal(false);
      setSelectedUpload(null);
      setSelectedFolderId(null);
    });
  };

  const fetchUnorganizedUploads = async () => {
    if (!user) return;

    try {
      // Get all user uploads
      const { data: allUploads, error: uploadsError } = await supabase
        .from('uploads')
        .select(`
          *,
          transcriptions (transcription_text),
          document_texts (extracted_text),
          summaries (summary_text)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (uploadsError) throw uploadsError;

      // Get all upload-folder associations
      const { data: uploadFolders, error: foldersError } = await supabase
        .from('upload_folders')
        .select('upload_id')
        .in('upload_id', (allUploads || []).map(upload => upload.id));

      if (foldersError) throw foldersError;

      // Filter out uploads that are in folders
      const organizedUploadIds = new Set((uploadFolders || []).map(uf => uf.upload_id));
      const unorganized = (allUploads || []).filter(upload => !organizedUploadIds.has(upload.id));

      setUploads(unorganized as UploadWithData[]);
    } catch (error) {
      console.error('Error fetching unorganized uploads:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchFolders = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setFolders(data || []);
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  useEffect(() => {
    fetchUnorganizedUploads();
    fetchFolders();
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchUnorganizedUploads();
    }, [user])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchUnorganizedUploads();
  };

  const handleAddToFolder = (upload: UploadWithData) => {
    setSelectedUpload(upload);
    setShowFolderModal(true);
  };

  const handleSaveFolderAssignment = async () => {
    if (!selectedUpload || !selectedFolderId) return;

    try {
      const { error } = await supabase
        .from('upload_folders')
        .insert({
          upload_id: selectedUpload.id,
          folder_id: selectedFolderId,
        });

      if (error) throw error;

      closeModal();
      fetchUnorganizedUploads(); // Refresh to remove from unorganized list
    } catch (error) {
      console.error('Error adding to folder:', error);
      Alert.alert('Error', 'Failed to add to folder');
    }
  };

  const handleUploadPress = (upload: UploadWithData) => {
    router.push(`./detail?id=${upload.id}`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} color={colors.success} />;
      case 'processing':
        return <Loader size={16} color={colors.warning} />;
      case 'error':
        return <AlertCircle size={16} color={colors.error} />;
      default:
        return <Clock size={16} color={colors.textSecondary} />;
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

  const formatAudioDuration = (durationSeconds: number | null | undefined): string => {
    if (!durationSeconds || !isFinite(durationSeconds) || isNaN(durationSeconds)) {
      return '';
    }
    
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const seconds = Math.floor(durationSeconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const renderUploadCard = (upload: UploadWithData) => {
    return (
      <TouchableOpacity 
        key={upload.id} 
        style={styles.uploadCard}
        onPress={() => handleUploadPress(upload)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.fileInfo}>
            <View style={styles.fileIcon}>
              {upload.file_type === 'audio' ? (
                <Mic size={20} color={colors.primary} />
              ) : (
                <FileText size={20} color={colors.primary} />
              )}
            </View>
            <View style={styles.fileDetails}>
              <Text style={styles.fileName} numberOfLines={1}>
                {upload.generated_name || upload.file_name}
              </Text>
              <Text style={styles.fileMetadata}>
                {upload.file_type === 'audio' && upload.duration 
                  ? `${formatAudioDuration(upload.duration)} • ${formatFileSize(upload.file_size)} • ${formatDate(upload.created_at)}`
                  : `${formatFileSize(upload.file_size)} • ${formatDate(upload.created_at)}`
                }
              </Text>
            </View>
          </View>
          
          <View style={styles.headerActions}>
            {/* Play button for audio files */}
            {upload.file_type === 'audio' && upload.status === 'completed' && (
              <TouchableOpacity
                style={styles.playButton}
                onPress={async (e) => {
                  e.stopPropagation();
                  const isCurrentlyPlaying = globalCurrentUpload?.id === upload.id;
                  
                  if (isCurrentlyPlaying) {
                    await globalTogglePlayback();
                  } else {
                    await playAudio(upload);
                  }
                }}
                disabled={globalAudioLoading}
                activeOpacity={0.7}
              >
                {globalAudioLoading && globalCurrentUpload?.id === upload.id ? (
                  <Loader size={16} color="#FFFFFF" />
                ) : globalCurrentUpload?.id === upload.id && globalIsPlaying ? (
                  <Pause size={16} color="#FFFFFF" />
                ) : (
                  <Play size={16} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            )}

            {/* Add to folder button */}
            <TouchableOpacity
              style={styles.addToFolderButton}
              onPress={(e) => {
                e.stopPropagation();
                handleAddToFolder(upload);
              }}
              activeOpacity={0.7}
            >
              <FolderPlus size={16} color={colors.primary} />
            </TouchableOpacity>
            
            {/* Status */}
            <View style={styles.statusContainer}>
              {getStatusIcon(upload.status)}
              <Text style={[styles.statusText, { 
                color: upload.status === 'completed' ? colors.success : 
                       upload.status === 'error' ? colors.error : colors.warning 
              }]}>
                {getStatusText(upload.status)}
              </Text>
            </View>
          </View>
        </View>

        {upload.status === 'completed' && upload.summaries && upload.summaries.length > 0 && (
          <View style={styles.cardContent}>
            <View style={styles.contentSection}>
              <Text style={styles.sectionTitle}>Summary</Text>
              <Text style={styles.summaryText} numberOfLines={3}>
                {upload.summaries[0].summary_text.substring(0, 200)}
                {upload.summaries[0].summary_text.length > 200 ? '...' : ''}
              </Text>
            </View>
            <View style={styles.tapHint}>
              <Text style={styles.tapHintText}>Tap to view full content</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Loader size={32} color={colors.primary} />
        <Text style={styles.loadingText}>Loading unorganized uploads...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>Unorganized</Text>
          
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {uploads.length === 0 ? (
            <View style={styles.emptyState}>
              <CheckCircle size={64} color={colors.success} />
              <Text style={styles.emptyTitle}>All organized!</Text>
              <Text style={styles.emptyDescription}>
                Great! All your uploads are organized into folders.
              </Text>
              <TouchableOpacity
                style={styles.emptyBackButton}
                onPress={() => router.back()}
                activeOpacity={0.8}
              >
                <ArrowLeft size={20} color={colors.primary} />
                <Text style={styles.emptyBackButtonText}>Back to Folders</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.headerInfo}>
                <Text style={styles.infoText}>
                  {uploads.length} {uploads.length === 1 ? 'item' : 'items'} not in any folder
                </Text>
              </View>
              
              <View style={styles.list}>
                {uploads.map(upload => renderUploadCard(upload))}
              </View>
            </>
          )}
        </ScrollView>
      </View>

      {/* Add to Folder Modal */}
      <Modal
        visible={showFolderModal}
        transparent={true}
        animationType="none"
        onRequestClose={closeModal}
      >
        <Animated.View 
          style={[
            styles.modalOverlay,
            {
              opacity: modalOpacity,
            }
          ]}
        >
          <TouchableOpacity 
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeModal}
          />
          
          <Animated.View 
            style={[
              styles.modalContainer,
              {
                transform: [{ translateY: modalTranslateY }],
              }
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Folder</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeModal}
                activeOpacity={0.7}
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Select a folder for "{selectedUpload?.generated_name || selectedUpload?.file_name}"
            </Text>

            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {folders.length === 0 ? (
                <View style={styles.modalEmptyState}>
                  <Text style={styles.modalEmptyText}>No folders available</Text>
                  <TouchableOpacity
                    style={styles.createFolderButton}
                    onPress={() => {
                      closeModal();
                      router.push('./folders');
                    }}
                    activeOpacity={0.7}
                  >
                    <Plus size={16} color={colors.primary} />
                    <Text style={styles.createFolderButtonText}>Create Folder</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                folders.map(folder => (
                  <TouchableOpacity
                    key={folder.id}
                    style={[
                      styles.folderOption,
                      selectedFolderId === folder.id && styles.selectedFolderOption
                    ]}
                    onPress={() => setSelectedFolderId(folder.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.folderOptionLeft}>
                      <View style={styles.folderOptionIcon}>
                        <Folder size={20} color={folder.color} />
                        <View style={[styles.folderColorIndicator, { backgroundColor: folder.color }]} />
                      </View>
                      <View style={styles.folderOptionDetails}>
                        <Text style={styles.folderOptionName} numberOfLines={1}>
                          {folder.name}
                        </Text>
                        {folder.description && (
                          <Text style={styles.folderOptionDescription} numberOfLines={1}>
                            {folder.description}
                          </Text>
                        )}
                      </View>
                    </View>
                    
                    <View style={[
                      styles.checkbox,
                      selectedFolderId === folder.id && styles.checkedCheckbox
                    ]}>
                      {selectedFolderId === folder.id && (
                        <CheckCircle size={20} color={colors.primary} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            {selectedFolderId && (
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveFolderAssignment}
                activeOpacity={0.8}
              >
                <Text style={styles.saveButtonText}>Add to Folder</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textSecondary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingTop: 50,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
      textAlign: 'center',
      marginHorizontal: 16,
    },
    headerSpacer: {
      width: 40,
    },
    content: {
      flex: 1,
    },
    headerInfo: {
      padding: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    infoText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      marginTop: 60,
    },
    emptyTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      marginTop: 24,
      marginBottom: 12,
    },
    emptyDescription: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 32,
    },
    emptyBackButton: {
      backgroundColor: colors.primary + '15',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderRadius: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    emptyBackButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    list: {
      padding: 16,
      gap: 12,
    },
    uploadCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
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
      backgroundColor: colors.primary + '15',
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
      color: colors.text,
      marginBottom: 4,
    },
    fileMetadata: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    playButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addToFolderButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
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
      gap: 12,
    },
    contentSection: {
      gap: 8,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    summaryText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    tapHint: {
      backgroundColor: colors.border + '40',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      alignItems: 'center',
    },
    tapHintText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modalContainer: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 20,
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
      color: colors.text,
    },
    closeButton: {
      padding: 4,
    },
    modalSubtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    modalContent: {
      maxHeight: 400,
      marginBottom: 20,
    },
    modalEmptyState: {
      alignItems: 'center',
      padding: 32,
    },
    modalEmptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    createFolderButton: {
      backgroundColor: colors.primary + '15',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    createFolderButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    folderOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.background,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    selectedFolderOption: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '10',
    },
    folderOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    folderOptionIcon: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      position: 'relative',
    },
    folderColorIndicator: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    folderOptionDetails: {
      flex: 1,
    },
    folderOptionName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    folderOptionDescription: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkedCheckbox: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '15',
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
