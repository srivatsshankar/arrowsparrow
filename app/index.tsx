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
  Image,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { Upload, Mic, FileText, Square, Clock, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Loader, X, Plus, Menu, User, LogOut, Settings } from 'lucide-react-native';
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
  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDropdownMenu, setShowDropdownMenu] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);

  const styles = createStyles(colors);

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

  const handleMenuItemPress = (action: string) => {
    setShowDropdownMenu(false);
    
    switch (action) {
      case 'profile':
        router.push('/profile');
        break;
      case 'settings':
        router.push('/settings');
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

  const handleUploadPress = (upload: UploadWithData) => {
    console.log('Navigating to detail with ID:', upload.id);
    router.push(`/detail?id=${upload.id}`);
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
            <Image
              source={{ uri: 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=2' }}
              style={styles.logoImage}
              accessibilityLabel="Arrow Sparrow icon"
              accessibilityRole="image"
            />
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

        {uploading && (
          <View style={styles.uploadingContainer}>
            <Loader size={20} color={colors.primary} />
            <Text style={styles.uploadingText}>Uploading and processing...</Text>
          </View>
        )}

        {uploads.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={64} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No content yet</Text>
            <Text style={styles.emptyDescription}>
              Upload your first audio recording or document to get started with AI-powered summaries and insights
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
            {uploads.map((upload) => (
              <TouchableOpacity 
                key={upload.id} 
                style={styles.uploadCard} 
                activeOpacity={0.7}
                onPress={() => handleUploadPress(upload)}
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

            <View style={styles.configNote}>
              <AlertCircle size={16} color={colors.warning} />
              <Text style={styles.configNoteText}>
                Note: AI processing requires API keys to be configured in your Supabase project settings.
              </Text>
            </View>
          </View>
        )}
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
                <X size={24} color={colors.textSecondary} />
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
                    <Mic size={24} color={Platform.OS === 'web' ? colors.textSecondary : colors.primary} />
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
                  <FileText size={24} color={colors.primary} />
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
    },
    logoImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
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
    uploadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12, // Reduced from 16
      backgroundColor: colors.primary + '15',
      marginHorizontal: 16, // Reduced from 24
      marginTop: 12, // Reduced from 16
      borderRadius: 12,
      gap: 12,
    },
    uploadingText: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: '500',
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
    configNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.warning + '15',
      padding: 10, // Reduced from 12
      borderRadius: 8,
      gap: 8,
    },
    configNoteText: {
      flex: 1,
      fontSize: 12,
      color: colors.warning,
      lineHeight: 16,
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
    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 20, // Reduced from 24
      paddingHorizontal: 20, // Reduced from 24
      paddingBottom: 32, // Reduced from 40
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
      marginBottom: 24, // Reduced from 32
    },
    uploadOptions: {
      gap: 12, // Reduced from 16
      marginBottom: 24, // Reduced from 32
    },
    uploadOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16, // Reduced from 20
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
    infoSection: {
      backgroundColor: colors.background,
      padding: 16, // Reduced from 20
      borderRadius: 16,
      marginBottom: 12, // Reduced from 16
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12, // Reduced from 16
    },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10, // Reduced from 12
    },
    infoNumber: {
      width: 24,
      height: 24,
      backgroundColor: colors.primary,
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
      color: colors.textSecondary,
    },
  });
}