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
import { useRouter, useLocalSearchParams } from 'expo-router';
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
  FolderMinus,
  MoreVertical,
  Circle,
  Trash2
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

export default function FolderDetailScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const { id: folderId, name: folderName } = useLocalSearchParams<{ 
    id: string; 
    name: string; 
  }>();
  
  const {
    currentUpload: globalCurrentUpload,
    isPlaying: globalIsPlaying,
    isLoading: globalAudioLoading,
    playAudio,
    togglePlayback: globalTogglePlayback,
  } = useAudioPlayer();

  const [uploads, setUploads] = useState<UploadWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [availableUploads, setAvailableUploads] = useState<UploadWithData[]>([]);
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set());
  
  // Multi-select state for deletion
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  
  // Animation values for modal
  const [modalOpacity] = useState(new Animated.Value(0));
  const [modalTranslateY] = useState(new Animated.Value(300));

  const styles = createStyles(colors);

  // Handle modal animations
  useEffect(() => {
    if (showAddModal) {
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
  }, [showAddModal]);

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
      setShowAddModal(false);
      setSelectedUploads(new Set());
    });
  };

  const fetchFolderUploads = async () => {
    if (!user || !folderId) return;

    try {
      const { data, error } = await supabase
        .from('upload_folders')
        .select(`
          uploads (
            *,
            transcriptions (transcription_text),
            document_texts (extracted_text),
            summaries (summary_text)
          )
        `)
        .eq('folder_id', folderId);

      if (error) throw error;

      const folderUploads = (data || [])
        .map((item: any) => item.uploads)
        .filter(Boolean) as UploadWithData[];

      setUploads(folderUploads);
    } catch (error) {
      console.error('Error fetching folder uploads:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchAvailableUploads = async () => {
    if (!user || !folderId) return;

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

      // Get uploads already in this folder
      const { data: folderUploads, error: folderError } = await supabase
        .from('upload_folders')
        .select('upload_id')
        .eq('folder_id', folderId);

      if (folderError) throw folderError;

      // Filter out uploads already in folder
      const folderUploadIds = new Set((folderUploads || []).map(item => item.upload_id));
      const available = (allUploads || []).filter(upload => !folderUploadIds.has(upload.id));

      setAvailableUploads(available as UploadWithData[]);
    } catch (error) {
      console.error('Error fetching available uploads:', error);
    }
  };

  useEffect(() => {
    fetchFolderUploads();
  }, [user, folderId]);

  useFocusEffect(
    useCallback(() => {
      fetchFolderUploads();
    }, [user, folderId])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchFolderUploads();
  };

  const handleAddUploads = async () => {
    await fetchAvailableUploads();
    setShowAddModal(true);
  };

  const handleToggleUpload = (uploadId: string) => {
    const newSelected = new Set(selectedUploads);
    if (newSelected.has(uploadId)) {
      newSelected.delete(uploadId);
    } else {
      newSelected.add(uploadId);
    }
    setSelectedUploads(newSelected);
  };

  const handleSaveSelection = async () => {
    if (!folderId || selectedUploads.size === 0) return;

    try {
      const insertData = Array.from(selectedUploads).map(uploadId => ({
        folder_id: folderId,
        upload_id: uploadId,
      }));

      const { error } = await supabase
        .from('upload_folders')
        .insert(insertData);

      if (error) throw error;

      closeModal();
      fetchFolderUploads();
    } catch (error) {
      console.error('Error adding uploads to folder:', error);
      Alert.alert('Error', 'Failed to add uploads to folder');
    }
  };

  const handleRemoveFromFolder = async (uploadId: string) => {
    Alert.alert(
      'Remove from Folder',
      'Are you sure you want to remove this item from the folder?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('upload_folders')
                .delete()
                .eq('folder_id', folderId)
                .eq('upload_id', uploadId);

              if (error) throw error;
              fetchFolderUploads();
            } catch (error) {
              console.error('Error removing upload from folder:', error);
              Alert.alert('Error', 'Failed to remove upload from folder');
            }
          },
        },
      ]
    );
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

  // Helper function to format audio duration in seconds
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderUploadCard = (upload: UploadWithData) => {
    const isClickable = true;
    const isSelected = selectedForDeletion.has(upload.id);
    
    return (
      <TouchableOpacity 
        key={upload.id} 
        style={[
          styles.uploadCard,
          isSelected && styles.selectedCard
        ]} 
        activeOpacity={0.7}
        onPress={() => {
          if (isSelectionMode) {
            toggleUploadSelection(upload.id);
          } else {
            handleUploadPress(upload);
          }
        }}
        onLongPress={() => {
          if (!isSelectionMode) {
            setIsSelectionMode(true);
            toggleUploadSelection(upload.id);
          }
        }}
      >
        <View style={styles.cardHeader}>
          {/* Selection checkbox - shown when in selection mode */}
          {isSelectionMode && (
            <TouchableOpacity
              style={styles.selectionCheckbox}
              onPress={() => toggleUploadSelection(upload.id)}
              activeOpacity={0.7}
            >
              {isSelected ? (
                <CheckCircle size={24} color={colors.primary} />
              ) : (
                <Circle size={24} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          )}
          
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
          
          <View style={styles.headerActionsRow}>
            {/* Play button for audio files - hidden in selection mode */}
            {!isSelectionMode && upload.file_type === 'audio' && upload.status === 'completed' && (
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
            
            {/* Menu button - hidden in selection mode */}
            {!isSelectionMode && (
              <TouchableOpacity
                style={styles.menuButton}
                onPress={() => {
                  Alert.alert(
                    upload.generated_name || upload.file_name,
                    'Choose an action',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove from Folder', onPress: () => handleRemoveFromFolder(upload.id) },
                    ]
                  );
                }}
                activeOpacity={0.7}
              >
                <MoreVertical size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            
            {/* Status - hidden in selection mode */}
            {!isSelectionMode && (
              <View style={styles.statusContainer}>
                {getStatusIcon(upload.status)}
                <Text style={[styles.statusText, { 
                  color: upload.status === 'completed' ? colors.success : 
                         upload.status === 'error' ? colors.error : colors.warning 
                }]}>
                  {getStatusText(upload.status)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {upload.status === 'completed' && !isSelectionMode && (
          <View style={styles.cardContent}>
            {upload.summaries && upload.summaries.length > 0 && (
              <View style={styles.contentSection}>
                <Text style={styles.sectionTitle}>Summary</Text>
                <Text style={styles.summaryText} numberOfLines={3}>
                  {upload.summaries[0].summary_text.substring(0, 200)}
                  {upload.summaries[0].summary_text.length > 200 ? '...' : ''}
                </Text>
              </View>
            )}

            <View style={styles.tapHint}>
              <Text style={styles.tapHintText}>Tap to view full content</Text>
            </View>
          </View>
        )}

        {upload.status === 'processing' && (
          <View style={styles.processingIndicator}>
            <Loader size={16} color={colors.warning} />
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Multi-select functions for deletion
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedForDeletion(new Set());
  };

  const toggleUploadSelection = (uploadId: string) => {
    const newSelection = new Set(selectedForDeletion);
    if (newSelection.has(uploadId)) {
      newSelection.delete(uploadId);
    } else {
      newSelection.add(uploadId);
    }
    setSelectedForDeletion(newSelection);
  };

  const selectAllUploads = () => {
    if (selectedForDeletion.size === uploads.length) {
      setSelectedForDeletion(new Set());
    } else {
      setSelectedForDeletion(new Set(uploads.map(upload => upload.id)));
    }
  };

  const removeSelectedFromFolder = async () => {
    if (selectedForDeletion.size === 0) return;

    Alert.alert(
      'Remove from Folder',
      `Are you sure you want to remove ${selectedForDeletion.size} item${selectedForDeletion.size > 1 ? 's' : ''} from this folder?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const uploadIds = Array.from(selectedForDeletion);
              
              const { error } = await supabase
                .from('upload_folders')
                .delete()
                .eq('folder_id', folderId)
                .in('upload_id', uploadIds);

              if (error) throw error;

              // Update local state
              setUploads(prev => prev.filter(upload => !selectedForDeletion.has(upload.id)));
              setSelectedForDeletion(new Set());
              setIsSelectionMode(false);

              Alert.alert('Success', `${uploadIds.length} item${uploadIds.length > 1 ? 's' : ''} removed from folder`);
            } catch (error) {
              console.error('Error removing uploads from folder:', error);
              Alert.alert('Error', 'Failed to remove some items from folder');
            }
          }
        }
      ]
    );
  };

  const deleteSelectedUploads = async () => {
    if (selectedForDeletion.size === 0) return;

    Alert.alert(
      'Delete Uploads',
      `Are you sure you want to permanently delete ${selectedForDeletion.size} upload${selectedForDeletion.size > 1 ? 's' : ''}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete files from storage first
              const uploadIds = Array.from(selectedForDeletion);
              const uploadsToDelete = uploads.filter(upload => uploadIds.includes(upload.id));
              
              for (const upload of uploadsToDelete) {
                // Extract file path from URL
                const url = new URL(upload.file_url);
                const filePath = url.pathname.split('/').pop();
                if (filePath) {
                  await supabase.storage
                    .from('uploads')
                    .remove([`${user?.id}/${filePath}`]);
                }
              }

              // Delete database records
              const { error } = await supabase
                .from('uploads')
                .delete()
                .in('id', uploadIds);

              if (error) throw error;

              // Update local state
              setUploads(prev => prev.filter(upload => !selectedForDeletion.has(upload.id)));
              setSelectedForDeletion(new Set());
              setIsSelectionMode(false);

              Alert.alert('Success', `${uploadIds.length} upload${uploadIds.length > 1 ? 's' : ''} deleted successfully`);
            } catch (error) {
              console.error('Error deleting uploads:', error);
              Alert.alert('Error', 'Failed to delete some uploads');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Loader size={32} color={colors.primary} />
        <Text style={styles.loadingText}>Loading folder content...</Text>
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
          
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{folderName || 'Folder'}</Text>
            {isSelectionMode && selectedForDeletion.size > 0 && (
              <Text style={styles.selectionText}>{selectedForDeletion.size} selected</Text>
            )}
          </View>
          
          <View style={styles.headerActions}>
            {uploads.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.selectButton,
                  isSelectionMode && styles.selectButtonActive
                ]}
                onPress={toggleSelectionMode}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.selectButtonText,
                  isSelectionMode && styles.selectButtonTextActive
                ]}>
                  {isSelectionMode ? 'Done' : 'Select'}
                </Text>
              </TouchableOpacity>
            )}
            
            {!isSelectionMode && (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddModal(true)}
                activeOpacity={0.7}
              >
                <Plus size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Selection Mode Controls */}
        {isSelectionMode && uploads.length > 0 && (
          <View style={styles.selectionControls}>
            <TouchableOpacity
              style={styles.selectAllButton}
              onPress={selectAllUploads}
              activeOpacity={0.7}
            >
              <Text style={styles.selectAllText}>
                {selectedForDeletion.size === uploads.length ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
            
            {selectedForDeletion.size > 0 && (
              <View style={styles.multiActionButtons}>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={removeSelectedFromFolder}
                  activeOpacity={0.7}
                >
                  <FolderMinus size={16} color="#FFFFFF" />
                  <Text style={styles.removeButtonText}>
                    Remove ({selectedForDeletion.size})
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={deleteSelectedUploads}
                  activeOpacity={0.7}
                >
                  <Trash2 size={16} color="#FFFFFF" />
                  <Text style={styles.deleteButtonText}>
                    Delete ({selectedForDeletion.size})
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {uploads.length === 0 ? (
            <View style={styles.emptyState}>
              <FileText size={64} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>No files in this folder</Text>
              <Text style={styles.emptyDescription}>
                Add files to this folder to organize your content
              </Text>
              <TouchableOpacity
                style={styles.emptyAddButton}
                onPress={() => setShowAddModal(true)}
                activeOpacity={0.8}
              >
                <Plus size={20} color={colors.primary} />
                <Text style={styles.emptyAddButtonText}>Add Files</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.list}>
              {uploads.map(upload => renderUploadCard(upload))}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Add Files Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="none"
        onRequestClose={closeModal}
      >
        <Animated.View 
          style={[
            styles.modalOverlay,
            { opacity: modalOpacity }
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
              { transform: [{ translateY: modalTranslateY }] }
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Files to Folder</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeModal}
                activeOpacity={0.7}
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Select files from your library to add to this folder
            </Text>

            <ScrollView style={styles.uploadsList} showsVerticalScrollIndicator={false}>
              {availableUploads.length === 0 ? (
                <View style={styles.noUploadsContainer}>
                  <Text style={styles.noUploadsText}>No available files to add</Text>
                </View>
              ) : (
                availableUploads.map(upload => (
                  <TouchableOpacity
                    key={upload.id}
                    style={[
                      styles.uploadOption,
                      selectedUploads.has(upload.id) && styles.selectedUploadOption
                    ]}
                    onPress={() => handleToggleUpload(upload.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.uploadOptionLeft}>
                      <View style={styles.uploadOptionIcon}>
                        {upload.file_type === 'audio' ? (
                          <Mic size={20} color={colors.primary} />
                        ) : (
                          <FileText size={20} color={colors.primary} />
                        )}
                      </View>
                      <View style={styles.uploadOptionDetails}>
                        <Text style={styles.uploadOptionName} numberOfLines={1}>
                          {upload.generated_name || upload.file_name}
                        </Text>
                        <Text style={styles.uploadOptionMetadata}>
                          {formatFileSize(upload.file_size)} • {formatDate(upload.created_at)}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={[
                      styles.checkbox,
                      selectedUploads.has(upload.id) && styles.checkedCheckbox
                    ]}>
                      {selectedUploads.has(upload.id) && (
                        <CheckCircle size={20} color={colors.primary} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeModal}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  selectedUploads.size === 0 && styles.disabledButton
                ]}
                onPress={handleSaveSelection}
                disabled={selectedUploads.size === 0}
                activeOpacity={0.7}
              >
                <Text style={styles.saveButtonText}>
                  Add {selectedUploads.size > 0 ? `(${selectedUploads.size})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
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
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    selectionText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 2,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    selectButton: {
      backgroundColor: colors.border + '40',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    selectButtonActive: {
      backgroundColor: colors.primary,
    },
    selectButtonText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    selectButtonTextActive: {
      color: '#FFFFFF',
    },
    addButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    selectionControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    selectAllButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    selectAllText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    multiActionButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    removeButton: {
      backgroundColor: colors.warning,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    removeButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    deleteButton: {
      backgroundColor: colors.error,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    deleteButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    content: {
      flex: 1,
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
    emptyAddButton: {
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
    emptyAddButtonText: {
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
    selectedCard: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.primary + '08',
    },
    selectionCheckbox: {
      marginRight: 12,
      alignSelf: 'flex-start',
      marginTop: 4,
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
    headerActionsRow: {
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
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    menuButton: {
      padding: 4,
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
      alignItems: 'center',
      marginTop: 8,
    },
    tapHintText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    processingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    processingText: {
      fontSize: 14,
      color: colors.warning,
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
    uploadsList: {
      maxHeight: 300,
      marginBottom: 20,
    },
    noUploadsContainer: {
      alignItems: 'center',
      padding: 32,
    },
    noUploadsText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    uploadOption: {
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
    selectedUploadOption: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '10',
    },
    uploadOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    uploadOptionIcon: {
      width: 32,
      height: 32,
      backgroundColor: colors.primary + '15',
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    uploadOptionDetails: {
      flex: 1,
    },
    uploadOptionName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    uploadOptionMetadata: {
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
    modalActions: {
      flexDirection: 'row',
      gap: 12,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: colors.border + '40',
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    cancelButtonText: {
      color: colors.textSecondary,
      fontSize: 16,
      fontWeight: '600',
    },
    saveButton: {
      flex: 1,
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
    disabledButton: {
      opacity: 0.5,
    },
  });
}
