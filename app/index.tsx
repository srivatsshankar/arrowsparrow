import { useState, useEffect, useCallback, useRef } from 'react';
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
  Image,
  Animated,
  Dimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useRecording } from '@/contexts/RecordingContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Upload, Mic, FileText, Square, Clock, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Loader, X, Plus, Menu, User, LogOut, Settings, Headphones, Pause, Play, ArrowLeft } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database';
import BoltLogo from '@/components/BoltLogo';

type Upload = Database['public']['Tables']['uploads']['Row'];
type UploadWithData = Upload & {
  transcriptions?: Array<{ transcription_text: string }>;
  document_texts?: Array<{ extracted_text: string }>;
  summaries?: Array<{ summary_text: string }>;
  key_points?: Array<{ point_text: string; importance_level: number }>;
};

export default function LibraryScreen() {
  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const { 
    isRecording, 
    startRecording, 
    stopRecording, 
    handleFileUpload,
    recordingInBackground,
    showRecordingScreen,
    recordingDuration,
    isPaused,
    returnToRecording,
    pauseRecording,
  } = useRecording();
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDropdownMenu, setShowDropdownMenu] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  
  // Animation values for modal
  const [modalOpacity] = useState(new Animated.Value(0));
  const [modalTranslateY] = useState(new Animated.Value(300));
  
  // Audio wave animation values
  const waveAnimations = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.5),
    new Animated.Value(0.7),
    new Animated.Value(0.4),
    new Animated.Value(0.6),
  ]).current;

  const styles = createStyles(colors);

  // Audio Wave Animation Component
  const AudioWaveVisualizer = ({ isActive, isPaused }: { isActive: boolean; isPaused: boolean }) => {
    useEffect(() => {
      if (isActive && !isPaused) {
        // Create staggered wave animation
        const animations = waveAnimations.map((wave, index) => 
          Animated.loop(
            Animated.sequence([
              Animated.timing(wave, {
                toValue: Math.random() * 0.8 + 0.2,
                duration: 300 + (index * 50),
                useNativeDriver: true,
              }),
              Animated.timing(wave, {
                toValue: Math.random() * 0.8 + 0.2,
                duration: 400 + (index * 40),
                useNativeDriver: true,
              }),
            ])
          )
        );
        
        animations.forEach((animation, index) => {
          setTimeout(() => animation.start(), index * 100);
        });

        return () => {
          animations.forEach(animation => animation.stop());
        };
      } else {
        // Reset to idle state
        waveAnimations.forEach((wave, index) => {
          Animated.timing(wave, {
            toValue: isPaused ? 0.2 : 0.3,
            duration: 200,
            useNativeDriver: true,
          }).start();
        });
      }
    }, [isActive, isPaused]);

    return (
      <View style={styles.audioWaveContainer}>
        {waveAnimations.map((wave, index) => (
          <Animated.View
            key={index}
            style={[
              styles.audioWave,
              {
                backgroundColor: isPaused ? colors.warning : colors.error,
                transform: [{ scaleY: wave }],
              },
            ]}
          />
        ))}
      </View>
    );
  };

  // Helper function to format recording duration
  const formatDuration = (milliseconds: number) => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle modal animations
  useEffect(() => {
    if (showUploadModal) {
      // Slide in animation
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
  }, [showUploadModal]);

  // Handle pulse animation for floating recording button - REMOVED to prevent size changes

  // Function to handle modal close with animation
  const closeModal = () => {
    // Slide out animation
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
      // Only set showUploadModal to false after animation completes
      setShowUploadModal(false);
    });
  };

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
    
    // Set up real-time subscription for upload status changes
    if (user) {
      const channel = supabase
        .channel('uploads-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'uploads',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('Real-time upload update:', payload);
            // Refresh uploads when changes occur
            fetchUploads();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  // Set up polling for processing uploads
  useEffect(() => {
    const hasProcessingUploads = uploads.some(upload => upload.status === 'processing');
    
    if (hasProcessingUploads && !pollingInterval) {
      // Start polling every 3 seconds when there are processing uploads
      const interval = setInterval(() => {
        console.log('Polling for upload status updates...');
        fetchUploads();
      }, 3000);
      setPollingInterval(interval);
    } else if (!hasProcessingUploads && pollingInterval) {
      // Stop polling when no uploads are processing
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }

    // Cleanup on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [uploads, pollingInterval]);

  // Cleanup recording timers on unmount - moved to RecordingContext

  // Refresh data when screen comes into focus (e.g., after returning from detail screen)
  useFocusEffect(
    useCallback(() => {
      console.log('Library screen focused - refreshing data');
      fetchUploads();
    }, [user])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchUploads();
  };

  const handleMenuItemPress = (action: string) => {
    setShowDropdownMenu(false);
    
    switch (action) {
      case 'profile':
        router.push('./profile');
        break;
      case 'settings':
        router.push('./settings');
        break;
      case 'signout':
        handleSignOut();
        break;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
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
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'audio/*',
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/m4a',
          'audio/aac',
          'audio/ogg',
          'audio/flac'
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        await handleFileUpload(file.uri, 'audio', file.name);
      }
    } catch (error) {
      console.error('Error picking audio:', error);
      Alert.alert('Error', 'Failed to pick audio file');
    }
  };

  // Function to generate a unique file path with versioning
  const generateUniqueFilePath = async (userId: string, originalFileName: string): Promise<string> => {
    const fileExt = originalFileName.split('.').pop();
    const baseName = originalFileName.replace(/\.[^/.]+$/, ''); // Remove extension
    
    let version = 0;
    let fileName = originalFileName;
    let filePath = `${userId}/${Date.now()}_${fileName}`;
    
    // Check if file exists and increment version if needed
    while (true) {
      const { data, error } = await supabase.storage
        .from('uploads')
        .list(userId, {
          search: fileName
        });
      
      if (error) {
        console.error('Error checking file existence:', error);
        break; // If we can't check, proceed with current name
      }
      
      // If no files found with this name, we can use it
      if (!data || data.length === 0) {
        break;
      }
      
      // If files exist with this name, increment version
      const existingFile = data.find(file => file.name.includes(fileName));
      if (!existingFile) {
        break;
      }
      
      version++;
      fileName = `${baseName}_v${version}.${fileExt}`;
      filePath = `${userId}/${Date.now()}_${fileName}`;
    }
    
    return filePath;
  };

  const handleUploadPress = (upload: UploadWithData) => {
    console.log('Navigating to detail with ID:', upload.id);
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

  const renderUploadCard = (upload: UploadWithData) => {
    const isClickable = true; // All files are clickable since 'uploading' status not yet supported
    
    return (
      <TouchableOpacity 
        key={upload.id} 
        style={[
          styles.uploadCard,
          !isClickable && styles.disabledCard
        ]} 
        activeOpacity={isClickable ? 0.7 : 1}
        onPress={isClickable ? () => handleUploadPress(upload) : undefined}
        disabled={!isClickable}
      >
        <View style={styles.cardHeader}>
          <View style={styles.fileInfo}>
            <View style={[
              styles.fileIcon,
              !isClickable && styles.disabledFileIcon
            ]}>
              {upload.file_type === 'audio' ? (
                <Mic size={20} color={isClickable ? colors.primary : colors.textSecondary} />
              ) : (
                <FileText size={20} color={isClickable ? colors.primary : colors.textSecondary} />
              )}
            </View>
            <View style={styles.fileDetails}>
              <Text style={[
                styles.fileName,
                !isClickable && styles.disabledText
              ]} numberOfLines={1}>
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
              color: upload.status === 'completed' ? colors.success : 
                     upload.status === 'error' ? colors.error : colors.warning 
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

            <View style={styles.tapHint}>
              <Text style={styles.tapHintText}>Tap to view full content</Text>
            </View>
          </View>
        )}

        {upload.status === 'processing' && (
          <View style={styles.processingIndicator}>
            <View style={styles.processingDots}>
              <View style={[styles.processingDot, { backgroundColor: colors.warning }]} />
              <View style={[styles.processingDot, { backgroundColor: colors.warning }]} />
              <View style={[styles.processingDot, { backgroundColor: colors.warning }]} />
            </View>
            <Text style={styles.processingText}>Processing with AI...</Text>
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
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Loader size={32} color={colors.primary} />
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
        {/* Top Navigation Bar */}
        <View style={styles.topBar}>
          <View style={styles.logoContainer}>
            {/* App Icon - For now using a styled placeholder, replace with actual icon */}
            <View style={styles.appIconContainer}>
              <Text style={styles.appIconText}>🏹</Text>
            </View>
          </View>
          
          <View style={styles.topBarActions}>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => setShowUploadModal(true)}
              activeOpacity={0.8}
            >
              <Plus size={18} color="#FFFFFF" />
              <Text style={styles.uploadButtonText}>Upload</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setShowDropdownMenu(true)}
              activeOpacity={0.8}
            >
              <Menu size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Library Header */}
        <View style={styles.libraryHeader}>
          <Text style={styles.title}>Your Library</Text>
          <Text style={styles.subtitle}>
            {uploads.length} item{uploads.length !== 1 ? 's' : ''} in your collection
          </Text>
        </View>

        {/* Floating Recording Bubble - Positioned above content, only visible on LibraryScreen when recording in background */}
        {(isRecording || recordingInBackground) && !showRecordingScreen && (
          <View style={styles.floatingRecordingBubbleContent}>
            <TouchableOpacity
              style={styles.floatingRecordingBubbleInner}
              onPress={returnToRecording}
              activeOpacity={0.9}
            >
              <View style={styles.floatingBubbleContent}>
                <AudioWaveVisualizer 
                  isActive={isRecording || recordingInBackground} 
                  isPaused={isPaused} 
                />
                <View style={styles.floatingBubbleText}>
                  <Text style={styles.floatingBubbleTitle}>
                    {isPaused ? 'Recording Paused' : 'Recording in Progress'}
                  </Text>
                  <Text style={styles.floatingBubbleTimer}>{formatDuration(recordingDuration)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.floatingBubbleIcon}
                  onPress={(e) => {
                    e.stopPropagation();
                    pauseRecording();
                  }}
                  activeOpacity={0.8}
                >
                  {isPaused ? (
                    <Play size={16} color={colors.primary} />
                  ) : (
                    <Pause size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {uploads.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={64} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No content yet</Text>
            <Text style={styles.emptyDescription}>
              Upload your first audio file or document to get started with AI-powered summaries and insights
            </Text>
            <TouchableOpacity
              style={styles.emptyUploadButton}
              onPress={() => setShowUploadModal(true)}
              activeOpacity={0.8}
            >
              <Upload size={20} color={colors.primary} />
              <Text style={styles.emptyUploadButtonText}>Upload Content</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {uploads.map(upload => renderUploadCard(upload))}
          </View>
        )}

        {/* Bolt Logo at bottom */}
        <BoltLogo style={styles.boltLogo} />
      </ScrollView>

      {/* Dropdown Menu Modal */}
      <Modal
        visible={showDropdownMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDropdownMenu(false)}
      >
        <TouchableOpacity 
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setShowDropdownMenu(false)}
        >
          <View style={styles.dropdownMenu}>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => handleMenuItemPress('profile')}
              activeOpacity={0.7}
            >
              <User size={20} color={colors.text} />
              <Text style={styles.dropdownItemText}>Profile</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => handleMenuItemPress('settings')}
              activeOpacity={0.7}
            >
              <Settings size={20} color={colors.text} />
              <Text style={styles.dropdownItemText}>Settings</Text>
            </TouchableOpacity>
            
            <View style={styles.dropdownDivider} />
            
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => handleMenuItemPress('signout')}
              activeOpacity={0.7}
            >
              <LogOut size={20} color={colors.error} />
              <Text style={[styles.dropdownItemText, { color: colors.error }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Upload Modal - Bottom Slide with Slide Out Animation */}
      <Modal
        visible={showUploadModal}
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
              <Text style={styles.modalTitle}>Upload Content</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeModal}
                activeOpacity={0.7}
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Choose how you'd like to add content to your library
            </Text>

            <View style={styles.uploadOptions}>
              <TouchableOpacity
                style={[styles.uploadOption, isRecording && styles.recordingOption]}
                onPress={async () => {
                  if (isRecording) {
                    await stopRecording();
                  } else {
                    closeModal();
                    await startRecording();
                  }
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIcon, isRecording && styles.recordingIcon]}>
                  {isRecording ? (
                    <Square size={24} color="#FFFFFF" />
                  ) : (
                    <Mic size={24} color={colors.primary} />
                  )}
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>
                    {isRecording ? 'Stop Recording' : 'Record Audio'}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {isRecording 
                      ? 'Tap to stop and upload'
                      : 'Record lectures, meetings, or conversations'
                    }
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.uploadOption}
                onPress={pickDocument}
                activeOpacity={0.8}
              >
                <View style={styles.optionIcon}>
                  <FileText size={24} color={colors.primary} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Upload Document</Text>
                  <Text style={styles.optionDescription}>
                    Upload PDF or Word documents for text extraction
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.uploadOption}
                onPress={pickAudio}
                activeOpacity={0.8}
              >
                <View style={styles.optionIcon}>
                  <Headphones size={24} color={colors.primary} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Upload Audio File</Text>
                  <Text style={styles.optionDescription}>
                    Upload MP3, WAV, M4A or other audio files for transcription
                  </Text>
                </View>
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
    // Top Navigation Bar - Reduced padding
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 16, // Reduced from 24
      paddingTop: 50, // Reduced from 60
      paddingBottom: 12, // Reduced from 16
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    logoContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    appIconContainer: {
      width: 48,
      height: 48,
      backgroundColor: colors.primary + '15',
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    appIconText: {
      fontSize: 24,
      textAlign: 'center',
    },
    appInfo: {
      flex: 1,
    },
    appName: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 2,
    },
    appTagline: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    topBarActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    uploadButton: {
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      gap: 6,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
      height: 38, // Explicit height for consistency
    },
    uploadButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    menuButton: {
      width: 38, // Same as upload button height
      height: 38, // Same as upload button height
      borderRadius: 10,
      backgroundColor: colors.border + '40',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    // Library Header - Reduced padding
    libraryHeader: {
      backgroundColor: colors.surface,
      paddingHorizontal: 16, // Reduced from 24
      paddingBottom: 16, // Reduced from 20
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32, // Reduced from 48
      marginTop: 40, // Reduced from 60
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
    emptyUploadButton: {
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
    emptyUploadButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    list: {
      padding: 16, // Reduced from 24
      gap: 12, // Reduced from 16
    },
    uploadCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16, // Reduced from 20
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
      gap: 12, // Reduced from 16
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
    keyPoint: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    keyPointBullet: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '600',
      marginTop: 2,
    },
    keyPointText: {
      flex: 1,
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    morePoints: {
      fontSize: 12,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 4,
      opacity: 0.7,
    },
    tapHint: {
      backgroundColor: colors.border + '40',
      paddingVertical: 6, // Reduced from 8
      paddingHorizontal: 10, // Reduced from 12
      borderRadius: 8,
      alignItems: 'center',
    },
    tapHintText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    errorSection: {
      backgroundColor: colors.error + '15',
      padding: 12,
      borderRadius: 8,
      marginTop: 8,
    },
    errorText: {
      fontSize: 14,
      color: colors.error,
      marginBottom: 4,
    },
    errorHint: {
      fontSize: 12,
      color: colors.error,
      fontStyle: 'italic',
      opacity: 0.8,
    },
    // Progress indicator styles
    uploadingIndicator: {
      alignItems: 'center',
      marginTop: 8,
    },
    uploadingText: {
      fontSize: 14,
      color: colors.primary,
      textAlign: 'center',
    },
    processingIndicator: {
      alignItems: 'center',
      marginTop: 8,
    },
    processingDots: {
      flexDirection: 'row',
      gap: 6,
    },
    processingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    // Dropdown menu styles
    dropdownOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingTop: 110, // Adjusted for reduced top bar height
      paddingRight: 16, // Reduced from 24
    },
    dropdownMenu: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 8,
      minWidth: 160,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
    },
    dropdownItemText: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    dropdownDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 4,
      marginHorizontal: 8,
    },
    // Modal styles - Bottom slide animation with slide out
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
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 10,
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
      marginBottom: 24,
    },
    uploadOptions: {
      gap: 12,
    },
    uploadOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.background,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    recordingOption: {
      backgroundColor: colors.error + '15',
      borderColor: colors.error,
    },
    optionIcon: {
      width: 48,
      height: 48,
      backgroundColor: colors.primary + '15',
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    recordingIcon: {
      backgroundColor: colors.error,
    },
    optionContent: {
      flex: 1,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    optionDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    disabledText: {
      color: colors.textSecondary,
      opacity: 0.6,
    },
    disabledCard: {
      opacity: 0.7,
    },
    disabledFileIcon: {
      backgroundColor: colors.textSecondary + '15',
    },
    processingText: {
      fontSize: 14,
      color: colors.warning,
      marginTop: 8,
      textAlign: 'center',
    },
    boltLogo: {
      marginTop: 20,
      marginBottom: 10,
    },
    // Floating Recording Bubble Styles (LibraryScreen only) - Content Flow Positioning
    floatingRecordingBubbleContent: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 24, // Added more top margin
    },
    floatingRecordingBubbleInner: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    floatingBubbleContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    // Audio Wave Visualizer Styles
    audioWaveContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 16,
      gap: 2,
    },
    audioWave: {
      width: 3,
      height: 16,
      borderRadius: 1.5,
      opacity: 0.8,
    },
    recordingIndicator: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    floatingBubbleText: {
      flex: 1,
    },
    floatingBubbleTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    floatingBubbleTimer: {
      fontSize: 12,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    floatingBubbleIcon: {
      width: 32,
      height: 32,
      backgroundColor: colors.background,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}