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
  TextInput,
  Animated,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { 
  ArrowLeft, 
  Plus, 
  Folder, 
  FolderOpen, 
  FileText, 
  Mic, 
  X, 
  Edit3, 
  Trash2,
  Circle,
  CheckCircle,
  MoreVertical,
  Archive
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database';

type Folder = Database['public']['Tables']['folders']['Row'];
type Upload = Database['public']['Tables']['uploads']['Row'];
type FolderWithStats = Folder & {
  upload_count: number;
  latest_upload?: string;
};

export default function FoldersScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [folders, setFolders] = useState<FolderWithStats[]>([]);
  const [unorganizedCount, setUnorganizedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderDescription, setFolderDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3B82F6');
  
  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  
  // Animation values for modal
  const [modalOpacity] = useState(new Animated.Value(0));
  const [modalTranslateY] = useState(new Animated.Value(300));
  
  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');

  const styles = createStyles(colors);

  const folderColors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Yellow
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#84CC16', // Lime
    '#EC4899', // Pink
    '#6B7280', // Gray
  ];

  // Handle modal animations
  useEffect(() => {
    if (showCreateModal) {
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
  }, [showCreateModal]);

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
      setShowCreateModal(false);
      setEditingFolder(null);
      setFolderName('');
      setFolderDescription('');
      setSelectedColor('#3B82F6');
    });
  };

  const showConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => onConfirm);
    setShowConfirmModal(true);
  };

  const handleConfirmAction = () => {
    if (confirmAction) {
      confirmAction();
    }
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  const fetchFolders = async () => {
    if (!user) return;

    try {
      // Fetch folders with upload counts
      const { data: foldersData, error } = await supabase
        .from('folders')
        .select(`
          *,
          upload_folders (
            upload_id,
            uploads (
              created_at
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Process folders to add stats
      const foldersWithStats: FolderWithStats[] = (foldersData || []).map(folder => {
        const uploadCount = folder.upload_folders?.length || 0;
        const latestUpload = folder.upload_folders?.length > 0 
          ? folder.upload_folders.sort((a: any, b: any) => 
              new Date(b.uploads?.created_at || 0).getTime() - 
              new Date(a.uploads?.created_at || 0).getTime()
            )[0]?.uploads?.created_at
          : undefined;

        return {
          ...folder,
          upload_count: uploadCount,
          latest_upload: latestUpload,
        };
      });

      setFolders(foldersWithStats);

      // Get count of uploads not in any folder
      const { data: allUploads, error: uploadsError } = await supabase
        .from('uploads')
        .select('id')
        .eq('user_id', user.id);

      const { data: organizedUploads, error: organizedError } = await supabase
        .from('upload_folders')
        .select('upload_id')
        .in('upload_id', (allUploads || []).map(u => u.id));

      if (!uploadsError && !organizedError) {
        const organizedIds = new Set((organizedUploads || []).map(uf => uf.upload_id));
        const unorganized = (allUploads || []).filter(upload => !organizedIds.has(upload.id));
        setUnorganizedCount(unorganized.length);
      }

    } catch (error) {
      console.error('Error fetching folders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchFolders();
    }, [user])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchFolders();
  };

  const handleCreateFolder = () => {
    setEditingFolder(null);
    setFolderName('');
    setFolderDescription('');
    setSelectedColor('#3B82F6');
    setShowCreateModal(true);
  };

  const handleEditFolder = (folder: Folder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDescription(folder.description || '');
    setSelectedColor(folder.color);
    setShowCreateModal(true);
  };

  const handleSaveFolder = async () => {
    if (!user || !folderName.trim()) return;

    try {
      if (editingFolder) {
        // Update existing folder
        const { error } = await supabase
          .from('folders')
          .update({
            name: folderName.trim(),
            description: folderDescription.trim() || null,
            color: selectedColor,
          })
          .eq('id', editingFolder.id);

        if (error) throw error;
      } else {
        // Create new folder
        const { error } = await supabase
          .from('folders')
          .insert({
            user_id: user.id,
            name: folderName.trim(),
            description: folderDescription.trim() || null,
            color: selectedColor,
          });

        if (error) throw error;
      }

      closeModal();
      fetchFolders();
    } catch (error) {
      console.error('Error saving folder:', error);
      Alert.alert('Error', 'Failed to save folder');
    }
  };

  const handleDeleteFolder = async (folder: Folder) => {
    showConfirmation(
      'Delete Folder',
      `Are you sure you want to delete "${folder.name}"? The uploads inside will be moved to unorganized.`,
      async () => {
        try {
          // When we delete the folder, the CASCADE will automatically remove 
          // the upload_folders associations, making those uploads unorganized
          const { error } = await supabase
            .from('folders')
            .delete()
            .eq('id', folder.id);

          if (error) throw error;
          fetchFolders();
        } catch (error) {
          console.error('Error deleting folder:', error);
          Alert.alert('Error', 'Failed to delete folder');
        }
      }
    );
  };

  // Multi-select functions
  const toggleSelectionMode = () => {
    console.log('Toggle selection mode, current state:', isSelectionMode);
    setIsSelectionMode(!isSelectionMode);
    setSelectedFolders(new Set());
  };

  const toggleFolderSelection = (folderId: string) => {
    console.log('Toggle folder selection for:', folderId);
    const newSelection = new Set(selectedFolders);
    if (newSelection.has(folderId)) {
      newSelection.delete(folderId);
    } else {
      newSelection.add(folderId);
    }
    console.log('New selection:', Array.from(newSelection));
    setSelectedFolders(newSelection);
  };

  const selectAllFolders = () => {
    console.log('Select all folders pressed, current selection size:', selectedFolders.size, 'total folders:', folders.length);
    if (selectedFolders.size === folders.length) {
      console.log('Deselecting all folders');
      setSelectedFolders(new Set());
    } else {
      const allIds = new Set(folders.map(folder => folder.id));
      console.log('Selecting all folders:', Array.from(allIds));
      setSelectedFolders(allIds);
    }
  };

  const deleteSelectedFolders = async () => {
    if (selectedFolders.size === 0) return;

    console.log('Delete folders button pressed, selected folders:', Array.from(selectedFolders));

    showConfirmation(
      'Delete Folders',
      `Are you sure you want to delete ${selectedFolders.size} folder${selectedFolders.size > 1 ? 's' : ''}? The uploads inside will be moved to unorganized.`,
      async () => {
        try {
          console.log('Starting folder deletion process...');
          const folderIds = Array.from(selectedFolders);
          
          console.log('Deleting folders with IDs:', folderIds);
          // When we delete folders, the CASCADE will automatically remove 
          // the upload_folders associations, making those uploads unorganized
          const { error } = await supabase
            .from('folders')
            .delete()
            .in('id', folderIds);

          if (error) {
            console.error('Database deletion error:', error);
            throw error;
          }

          console.log('Successfully deleted folders from database');

          // Update local state
          setFolders(prev => prev.filter(folder => !selectedFolders.has(folder.id)));
          setSelectedFolders(new Set());
          setIsSelectionMode(false);

        } catch (error) {
          console.error('Error deleting folders:', error);
          Alert.alert('Error', 'Failed to delete folders. Please try again.');
        }
      }
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No uploads yet';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };
  const renderFolderCard = (folder: FolderWithStats) => {
    const isSelected = selectedFolders.has(folder.id);
    
    return (
      <TouchableOpacity
        key={folder.id}
        style={[
          styles.folderCard,
          isSelected && styles.selectedFolderCard
        ]}
        onPress={() => {
          if (isSelectionMode) {
            toggleFolderSelection(folder.id);
          } else {
            router.push(`./folder-detail?id=${folder.id}&name=${encodeURIComponent(folder.name)}`);
          }
        }}
        onLongPress={() => {
          if (!isSelectionMode) {
            setIsSelectionMode(true);
            toggleFolderSelection(folder.id);
          }
        }}
        activeOpacity={0.7}
      >
        {/* Selection checkbox - shown when in selection mode */}
        {isSelectionMode && (
          <TouchableOpacity
            style={styles.folderSelectionCheckbox}
            onPress={() => toggleFolderSelection(folder.id)}
            activeOpacity={0.7}
          >
            {isSelected ? (
              <CheckCircle size={24} color={colors.primary} />
            ) : (
              <Circle size={24} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        )}
        
        <View style={styles.folderIconContainer}>
          <Folder size={24} color={folder.color} />
          <View style={[styles.folderColorIndicator, { backgroundColor: folder.color }]} />
        </View>

        <View style={styles.folderContent}>
          <Text style={styles.folderName} numberOfLines={1}>
            {folder.name}
          </Text>
          
          {folder.description && (
            <Text style={styles.folderDescription} numberOfLines={2}>
              {folder.description}
            </Text>
          )}
          
          <View style={styles.folderStats}>
            <Text style={styles.folderStatsText}>
              {folder.upload_count} {folder.upload_count === 1 ? 'item' : 'items'}
            </Text>
            {folder.latest_upload && (
              <Text style={styles.folderStatsText}>
                • Updated {formatDate(folder.latest_upload)}
              </Text>
            )}
          </View>
        </View>

        {/* Menu button - hidden in selection mode */}
        {!isSelectionMode && (
          <TouchableOpacity
            style={styles.folderMenuButton}
            onPress={() => {
              Alert.alert(
                folder.name,
                'Choose an action',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Edit', onPress: () => handleEditFolder(folder) },
                  { text: 'Delete', style: 'destructive', onPress: () => handleDeleteFolder(folder) },
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <MoreVertical size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

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
            <Text style={styles.headerTitle}>Folders</Text>
            {isSelectionMode && selectedFolders.size > 0 && (
              <Text style={styles.selectionText}>{selectedFolders.size} selected</Text>
            )}
          </View>
          
          <View style={styles.headerActions}>
            {folders.length > 0 && (
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
                style={styles.createButton}
                onPress={handleCreateFolder}
                activeOpacity={0.7}
              >
                <Plus size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Selection Mode Controls */}
        {isSelectionMode && folders.length > 0 && (
          <View style={styles.selectionControls}>
            <TouchableOpacity
              style={styles.selectAllButton}
              onPress={selectAllFolders}
              activeOpacity={0.7}
            >
              <Text style={styles.selectAllText}>
                {selectedFolders.size === folders.length ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
            
            {selectedFolders.size > 0 && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => {
                  console.log('Delete button pressed, selected folders:', Array.from(selectedFolders));
                  deleteSelectedFolders();
                }}
                activeOpacity={0.7}
              >
                <Trash2 size={16} color="#FFFFFF" />
                <Text style={styles.deleteButtonText}>
                  Delete ({selectedFolders.size})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Library Section */}
          <TouchableOpacity
            style={styles.libraryCard}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <View style={styles.libraryIconContainer}>
              <Archive size={24} color={colors.primary} />
            </View>
            <View style={styles.libraryContent}>
              <Text style={styles.libraryName}>All Library</Text>
              <Text style={styles.libraryDescription}>View all your uploads</Text>
            </View>
            <Text style={styles.libraryArrow}>→</Text>
          </TouchableOpacity>

          {/* Unorganized Section */}
          {unorganizedCount > 0 && (
            <TouchableOpacity
              style={styles.unorganizedCard}
              onPress={() => router.push('./unorganized-uploads')}
              activeOpacity={0.7}
            >
              <View style={styles.unorganizedIconContainer}>
                <FileText size={24} color={colors.warning} />
              </View>
              <View style={styles.unorganizedContent}>
                <Text style={styles.unorganizedName}>Unorganized</Text>
                <Text style={styles.unorganizedDescription}>
                  {unorganizedCount} {unorganizedCount === 1 ? 'item' : 'items'} not in folders
                </Text>
              </View>
              <Text style={styles.unorganizedArrow}>→</Text>
            </TouchableOpacity>
          )}

          {/* Folders Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Folders</Text>
            
            {folders.length === 0 ? (
              <View style={styles.emptyState}>
                <Folder size={48} color={colors.textSecondary} />
                <Text style={styles.emptyTitle}>No folders yet</Text>
                <Text style={styles.emptyDescription}>
                  Create folders to organize your uploads
                </Text>
                <TouchableOpacity
                  style={styles.emptyCreateButton}
                  onPress={handleCreateFolder}
                  activeOpacity={0.8}
                >
                  <Plus size={20} color={colors.primary} />
                  <Text style={styles.emptyCreateButtonText}>Create Folder</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.foldersGrid}>
                {folders.map(folder => renderFolderCard(folder))}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Create/Edit Folder Modal */}
      <Modal
        visible={showCreateModal}
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
              <Text style={styles.modalTitle}>
                {editingFolder ? 'Edit Folder' : 'Create Folder'}
              </Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeModal}
                activeOpacity={0.7}
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Folder Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={folderName}
                  onChangeText={setFolderName}
                  placeholder="Enter folder name"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={50}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description (Optional)</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={folderDescription}
                  onChangeText={setFolderDescription}
                  placeholder="Enter folder description"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Color</Text>
                <View style={styles.colorPicker}>
                  {folderColors.map(color => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        selectedColor === color && styles.selectedColor
                      ]}
                      onPress={() => setSelectedColor(color)}
                      activeOpacity={0.7}
                    >
                      {selectedColor === color && (
                        <CheckCircle size={20} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!folderName.trim()) && styles.disabledButton
                ]}
                onPress={handleSaveFolder}
                disabled={!folderName.trim()}
                activeOpacity={0.8}
              >
                <Text style={styles.saveButtonText}>
                  {editingFolder ? 'Update Folder' : 'Create Folder'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        transparent
        visible={showConfirmModal}
        animationType="fade"
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>{confirmTitle}</Text>
            <Text style={styles.confirmModalMessage}>{confirmMessage}</Text>
            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalCancelButton]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.confirmModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalConfirmButton]}
                onPress={handleConfirmAction}
              >
                <Text style={styles.confirmModalConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    createButton: {
      backgroundColor: colors.primary,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flex: 1,
      padding: 16,
    },
    libraryCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    libraryIconContainer: {
      width: 48,
      height: 48,
      backgroundColor: colors.primary + '15',
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    libraryContent: {
      flex: 1,
    },
    libraryName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    libraryDescription: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    libraryArrow: {
      fontSize: 20,
      color: colors.textSecondary,
    },
    unorganizedCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.warning + '30',
    },
    unorganizedIconContainer: {
      width: 48,
      height: 48,
      backgroundColor: colors.warning + '15',
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    unorganizedContent: {
      flex: 1,
    },
    unorganizedName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    unorganizedDescription: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    unorganizedArrow: {
      fontSize: 20,
      color: colors.textSecondary,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 16,
    },
    foldersGrid: {
      gap: 12,
    },
    folderCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    folderIconContainer: {
      width: 48,
      height: 48,
      backgroundColor: colors.background,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
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
    folderContent: {
      flex: 1,
      gap: 4,
    },
    folderMenuButton: {
      padding: 8,
      marginLeft: 8,
    },
    folderName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    folderDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    folderStats: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    folderStatsText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    emptyState: {
      alignItems: 'center',
      padding: 32,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyDescription: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    emptyCreateButton: {
      backgroundColor: colors.primary + '15',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    emptyCreateButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
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
      marginBottom: 24,
    },
    modalTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    closeButton: {
      padding: 4,
    },
    modalContent: {
      gap: 20,
    },
    inputGroup: {
      gap: 8,
    },
    inputLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    textInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    textArea: {
      height: 80,
      textAlignVertical: 'top',
    },
    colorPicker: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    colorOption: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: 'transparent',
    },
    selectedColor: {
      borderColor: colors.background,
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    disabledButton: {
      backgroundColor: colors.textSecondary,
      opacity: 0.5,
    },
    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    // Multi-select styles
    selectedFolderCard: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.primary + '08',
    },
    folderSelectionCheckbox: {
      position: 'absolute',
      top: 12,
      right: 12,
      zIndex: 1,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
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
    // Confirmation modal styles
    confirmModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    confirmModalContent: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 320,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    },
    confirmModalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    confirmModalMessage: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    confirmModalActions: {
      flexDirection: 'row',
      gap: 12,
    },
    confirmModalButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    confirmModalCancelButton: {
      backgroundColor: colors.border + '40',
    },
    confirmModalConfirmButton: {
      backgroundColor: colors.error,
    },
    confirmModalCancelText: {
      color: colors.textSecondary,
      fontSize: 16,
      fontWeight: '600',
    },
    confirmModalConfirmText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
