import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Linking,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database';
import { ArrowLeft, FileText, Mic, MessageSquare, List, Trash2, Menu, X, Play, Pause, Settings, Download, FolderPlus, Folder, CheckCircle, Plus } from 'lucide-react-native';
import BoltLogo from '@/components/BoltLogo';

type Upload = Database['public']['Tables']['uploads']['Row'];
type UploadWithData = Upload & {
  transcriptions?: Array<{ transcription_text: string }>;
  document_texts?: Array<{ extracted_text: string }>;
  summaries?: Array<{ summary_text: string }>;
  key_points?: Array<{ point_text: string; importance_level: number }>;
};

// Types for transcription response
type TranscriptionSegment = {
  text: string;
  start: number; // in seconds
  end: number; // in seconds
  speaker?: string;
};

type TranscriptionWord = {
  text: string;
  start: number;
  end: number;
  type: 'word' | 'spacing';
  speakerId?: string;
  logprob?: number;
};

type SpeakerParagraph = {
  speaker: string;
  text: string;
  start: number;
  end: number;
  words: TranscriptionWord[];
  segments: WordSegment[];
};

type WordSegment = {
  text: string;
  start: number;
  end: number;
  words: TranscriptionWord[];
};

type ElevenLabsTranscription = {
  text: string;
  languageCode?: string;
  languageProbability?: number;
  words?: TranscriptionWord[];
  segments?: TranscriptionSegment[];
  timestamps?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
};

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const {
    currentUpload: globalCurrentUpload,
    sound: globalSound,
    isPlaying: globalIsPlaying,
    isLoading: globalAudioLoading,
    currentPosition: globalCurrentPosition,
    duration: globalDuration,
    activeSegmentId: globalActiveSegmentId,
    playAudio,
    togglePlayback: globalTogglePlayback,
    seekToPosition: globalSeekToPosition,
    getTranscriptionData: globalGetTranscriptionData,
  } = useAudioPlayer();
  
  const [upload, setUpload] = useState<UploadWithData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDropdownMenu, setShowDropdownMenu] = useState(false);
  
  // File name editing state
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const [editingFileName, setEditingFileName] = useState('');
  const [isUpdatingFileName, setIsUpdatingFileName] = useState(false);
  
  // Local state for UI interactions
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(null);
  
  // Folder management state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folders, setFolders] = useState<Array<{id: string; name: string; color: string; description?: string}>>([]);
  const [currentFolders, setCurrentFolders] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);
  const [hoveredWordIndex, setHoveredWordIndex] = useState<number | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [progressBarWidth, setProgressBarWidth] = useState<number>(200);
  
  // Check if this upload is currently playing in the global player
  const isCurrentlyPlaying = globalCurrentUpload?.id === upload?.id;
  const sound = isCurrentlyPlaying ? globalSound : null;
  const isPlaying = isCurrentlyPlaying ? globalIsPlaying : false;
  const audioLoading = isCurrentlyPlaying ? globalAudioLoading : false;
  const currentPosition = isCurrentlyPlaying ? globalCurrentPosition : 0;
  const duration = isCurrentlyPlaying ? globalDuration : 0;
  const activeSegmentId = isCurrentlyPlaying ? globalActiveSegmentId : null;
  
  const scrollViewRef = useRef<ScrollView>(null);
  const summaryRef = useRef<View>(null);
  const keyPointsRef = useRef<View>(null);
  const contentRef = useRef<View>(null);

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

  const scrollToSection = (sectionRef: React.RefObject<View | null>) => {
    if (sectionRef.current && scrollViewRef.current) {
      sectionRef.current.measureLayout(
        scrollViewRef.current.getInnerViewNode?.() || scrollViewRef.current,
        (x, y) => {
          scrollViewRef.current?.scrollTo({ y: y - 20, animated: true });
        },
        () => console.log('Failed to measure layout')
      );
    }
  };

  useEffect(() => {
    if (id && user) {
      fetchUploadDetail();
    }
  }, [id, user]);

  // Stop audio when screen loses focus (user navigates away)
  useFocusEffect(
    useCallback(() => {
      // Screen is focused - no action needed
      return () => {
        // Screen is losing focus - no need to stop global audio player
        // The global audio player should continue playing
        console.log('Screen losing focus - global audio continues playing');
      };
    }, [])
  );

  // Cleanup is handled by global audio player
  useEffect(() => {
    return () => {
      // No local cleanup needed - global audio player handles this
      console.log('Detail screen unmounting - global audio continues');
    };
  }, []);

  // Audio position tracking is handled by the global audio player
  // No local tracking needed

  const fetchUploadDetail = async () => {
    if (!user || !id) return;

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
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching upload detail:', error);
        return;
      }

      // Check if no data was returned (record not found or deleted)
      if (data === null) {
        console.log('Upload not found or user does not have permission to view it');
        setUpload(null);
        return;
      }

      setUpload(data as UploadWithData);
    } catch (error) {
      console.error('Error fetching upload detail:', error);
    } finally {
      setLoading(false);
    }
  };

  // Parse transcription data and extract segments with timestamps
  const getTranscriptionSegments = (): TranscriptionSegment[] => {
    if (!upload || !upload.transcriptions || upload.transcriptions.length === 0) {
      console.log('No upload or transcriptions found');
      return [];
    }

    try {
      const transcriptionText = upload.transcriptions[0].transcription_text;
      console.log('Raw transcription text:', transcriptionText);
      
      // Try to parse as JSON first
      let transcriptionData: ElevenLabsTranscription;
      try {
        transcriptionData = JSON.parse(transcriptionText);
        console.log('Parsed transcription data:', transcriptionData);
      } catch (parseError) {
        console.log('Failed to parse as JSON, treating as plain text:', parseError);
        // If not JSON, create a single segment with the entire text
        return [{
          text: transcriptionText,
          start: 0,
          end: 0,
        }];
      }
      
      // Check for pre-existing segments first (legacy format)
      if (transcriptionData.segments && transcriptionData.segments.length > 0) {
        console.log('Found pre-existing segments:', transcriptionData.segments.length);
        return transcriptionData.segments;
      } 
      
      // Check for timestamps array (alternative format)
      if (transcriptionData.timestamps && transcriptionData.timestamps.length > 0) {
        console.log('Found timestamps array:', transcriptionData.timestamps.length);
        return transcriptionData.timestamps.map(item => ({
          text: item.text,
          start: item.start,
          end: item.end
        }));
      }
      
      // New format: Create segments from words array
      if (transcriptionData.words && transcriptionData.words.length > 0) {
        console.log('Found words array, creating segments:', transcriptionData.words.length);
        return createSegmentsFromWords(transcriptionData.words);
      }
      
      // Check if it has text but no segments/timestamps/words - create single segment
      if (transcriptionData.text) {
        console.log('Found text but no segments/timestamps/words, creating single segment');
        return [{
          text: transcriptionData.text,
          start: 0,
          end: 0,
        }];
      }
      
      console.log('No usable transcript data found');
      return [];
    } catch (error) {
      console.error('Error parsing transcription data:', error);
      return [];
    }
  };

  // Get the raw transcription data - use global if available, otherwise local
  const getTranscriptionData = (): ElevenLabsTranscription | null => {
    // If this upload is currently playing in global player, use global data
    if (isCurrentlyPlaying) {
      return globalGetTranscriptionData();
    }
    
    // Otherwise, use local upload data
    if (!upload || !upload.transcriptions || upload.transcriptions.length === 0) {
      return null;
    }

    try {
      const transcriptionText = upload.transcriptions[0].transcription_text;
      return JSON.parse(transcriptionText);
    } catch (error) {
      console.error('Error parsing transcription data:', error);
      return null;
    }
  };

  // Create speaker paragraphs from words array
  const createSpeakerParagraphs = (words: TranscriptionWord[]): SpeakerParagraph[] => {
    const paragraphs: SpeakerParagraph[] = [];
    let currentParagraph: SpeakerParagraph | null = null;
    
    console.log('Creating speaker paragraphs from words array:', words.length);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const speakerId = word.speakerId || 'speaker_0';
      
      // Start a new paragraph if speaker changes or we don't have one
      if (!currentParagraph || currentParagraph.speaker !== speakerId) {
        // Finalize current paragraph and create segments
        if (currentParagraph) {
          currentParagraph.segments = createSegmentsFromParagraphWords(currentParagraph.words);
          paragraphs.push(currentParagraph);
        }
        
        // Start new paragraph
        currentParagraph = {
          speaker: speakerId,
          text: word.text,
          start: word.start,
          end: word.end,
          words: [word],
          segments: []
        };
      } else {
        // Add to current paragraph
        currentParagraph.text += word.text;
        currentParagraph.end = word.end;
        currentParagraph.words.push(word);
      }
    }
    
    // Add the last paragraph
    if (currentParagraph) {
      currentParagraph.segments = createSegmentsFromParagraphWords(currentParagraph.words);
      paragraphs.push(currentParagraph);
    }
    
    console.log(`Created ${paragraphs.length} speaker paragraphs from ${words.length} words`);
    return paragraphs;
  };

  // Create segments from paragraph words - groups words into meaningful phrases/sentences
  const createSegmentsFromParagraphWords = (words: TranscriptionWord[]): WordSegment[] => {
    const segments: WordSegment[] = [];
    let currentSegment: WordSegment | null = null;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Start new segment if we don't have one
      if (!currentSegment) {
        currentSegment = {
          text: word.text,
          start: word.start,
          end: word.end,
          words: [word]
        };
      } else {
        // Add word to current segment
        currentSegment.text += word.text;
        currentSegment.end = word.end;
        currentSegment.words.push(word);
      }
      
      // Determine if we should end this segment
      let shouldEndSegment = false;
      
      // End segment on sentence-ending punctuation
      if (word.type === 'word' && /[.!?]$/.test(word.text.trim())) {
        shouldEndSegment = true;
      }
      
      // End segment on natural pauses (longer spacing)
      const nextWordIndex = i + 1;
      if (nextWordIndex < words.length) {
        const nextWord = words[nextWordIndex];
        if (nextWord.type === 'spacing' && (nextWord.end - nextWord.start) > 0.5) {
          shouldEndSegment = true;
        }
      }
      
      // End segment if it's getting too long (time-based)
      if (currentSegment.end - currentSegment.start > 6) { // 6 seconds max per segment
        shouldEndSegment = true;
      }
      
      // End segment if text is getting very long
      if (currentSegment.text.length > 100) {
        // Look for a natural break point (comma, pause, etc.)
        if (word.type === 'word' && /[,;:]$/.test(word.text.trim())) {
          shouldEndSegment = true;
        }
      }
      
      // Always end segment at the last word
      if (i === words.length - 1) {
        shouldEndSegment = true;
      }
      
      if (shouldEndSegment && currentSegment) {
        // Clean up the text and add to segments
        const cleanText = currentSegment.text.trim();
        if (cleanText.length > 0) {
          const newSegment = {
            text: cleanText,
            start: currentSegment.start,
            end: currentSegment.end,
            words: currentSegment.words
          };
          segments.push(newSegment);
          console.log(`Created segment: "${cleanText}" (${newSegment.start}s - ${newSegment.end}s)`);
        }
        currentSegment = null;
      }
    }
    
    return segments;
  };

  // Create segments from words array by grouping words into sentences
  const createSegmentsFromWords = (words: TranscriptionWord[]): TranscriptionSegment[] => {
    const segments: TranscriptionSegment[] = [];
    let currentSegment: TranscriptionSegment | null = null;
    
    console.log('Creating segments from words array:', words.length);
    
    // Group words into segments (sentences or logical chunks)
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Include all text (words and spacing)
      if (!currentSegment) {
        // Start a new segment
        currentSegment = {
          text: word.text,
          start: word.start,
          end: word.end,
          speaker: word.speakerId
        };
      } else {
        // Add to current segment
        currentSegment.text += word.text;
        currentSegment.end = word.end;
      }
      
      // Determine if we should end this segment
      let shouldEndSegment = false;
      
      // End segment on sentence-ending punctuation
      if (word.type === 'word' && /[.!?]$/.test(word.text.trim())) {
        shouldEndSegment = true;
      }
      
      // End segment if it's getting too long (time-based)
      if (currentSegment.end - currentSegment.start > 8) { // 8 seconds max per segment
        shouldEndSegment = true;
      }
      
      // End segment if text is getting very long
      if (currentSegment.text.length > 150) {
        // Look for a natural break point
        if (word.type === 'spacing' && word.text.includes(' ')) {
          shouldEndSegment = true;
        }
      }
      
      // Always end segment at the last word
      if (i === words.length - 1) {
        shouldEndSegment = true;
      }
      
      if (shouldEndSegment && currentSegment) {
        // Clean up the text and add to segments
        const cleanText = currentSegment.text.trim();
        if (cleanText.length > 0) {
          segments.push({
            text: cleanText,
            start: currentSegment.start,
            end: currentSegment.end,
            speaker: currentSegment.speaker
          });
          console.log(`Created segment ${segments.length}: "${cleanText.substring(0, 50)}..." (${currentSegment.start}s - ${currentSegment.end}s)`);
        }
        currentSegment = null;
      }
    }
    
    console.log(`Successfully created ${segments.length} segments from ${words.length} words`);
    return segments;
  };

  // Load and play audio using global audio player
  const loadAudio = async (shouldAutoPlay: boolean = true) => {
    if (!upload || upload.file_type !== 'audio') return;

    try {
      // Use global audio player to play this upload
      // Pass the upload with full transcription data
      await playAudio(upload);
      console.log(`Audio loaded via global player: ${upload.file_name}`);
    } catch (error) {
      console.error('Error loading audio via global player:', error);
      Alert.alert('Error', 'Failed to load audio file');
    }
  };

  // Audio status update handler is no longer needed - handled by global player
  const onAudioStatusUpdate = (status: any) => {
    // This function is no longer used since global audio player handles status updates
  };

  const togglePlayback = async () => {
    if (!upload || upload.file_type !== 'audio') return;
    
    if (!isCurrentlyPlaying || !sound) {
      // Load and play audio via global player
      console.log('No sound loaded or different upload, loading audio and starting playback...');
      await loadAudio();
      return;
    }

    // Use global toggle playback
    await globalTogglePlayback();
  };

  const seekToPosition = async (seconds: number) => {
    if (!isCurrentlyPlaying || !sound) {
      console.log('Cannot seek - not currently playing or no sound loaded');
      return;
    }

    // Use global seek function
    await globalSeekToPosition(seconds);
  };

  const formatTime = (seconds: number) => {
    // Handle invalid values (NaN, infinity, negative, null, undefined)
    if (!seconds || !isFinite(seconds) || seconds < 0 || isNaN(seconds)) {
      return '0:00';
    }
    
    // Ensure we have a valid number
    const validSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(validSeconds / 60);
    const secs = validSeconds % 60;
    
    // Handle very large durations (over 99 minutes)
    if (mins > 99) {
      const hours = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDelete = async () => {
    console.log('=== DELETE FUNCTION CALLED ===');
    
    if (!upload || !user) {
      console.error('No upload or user found for deletion');
      Alert.alert('Error', 'Unable to delete: missing upload or user information');
      return;
    }

    console.log('Starting deletion process for upload:', {
      uploadId: upload.id,
      fileName: upload.file_name,
      fileUrl: upload.file_url,
      userId: user.id,
      uploadUserId: upload.user_id
    });

    // Verify ownership before proceeding
    if (upload.user_id !== user.id) {
      console.error('User ID mismatch:', { currentUser: user.id, uploadOwner: upload.user_id });
      Alert.alert('Error', 'You do not have permission to delete this item');
      return;
    }
    
    setDeleting(true);
    
    try {
      // Step 1: Delete related records first (to avoid foreign key constraints)
      console.log('Deleting related records...');
      
      // Delete transcriptions
      const { error: transcriptionsError } = await supabase
        .from('transcriptions')
        .delete()
        .eq('upload_id', upload.id);
      
      if (transcriptionsError) {
        console.error('Error deleting transcriptions:', transcriptionsError);
      } else {
        console.log('Transcriptions deleted successfully');
      }

      // Delete document texts
      const { error: documentTextsError } = await supabase
        .from('document_texts')
        .delete()
        .eq('upload_id', upload.id);
      
      if (documentTextsError) {
        console.error('Error deleting document texts:', documentTextsError);
      } else {
        console.log('Document texts deleted successfully');
      }

      // Delete summaries
      const { error: summariesError } = await supabase
        .from('summaries')
        .delete()
        .eq('upload_id', upload.id);
      
      if (summariesError) {
        console.error('Error deleting summaries:', summariesError);
      } else {
        console.log('Summaries deleted successfully');
      }

      // Delete key points
      const { error: keyPointsError } = await supabase
        .from('key_points')
        .delete()
        .eq('upload_id', upload.id);
      
      if (keyPointsError) {
        console.error('Error deleting key points:', keyPointsError);
      } else {
        console.log('Key points deleted successfully');
      }

      // Step 2: Try to delete from storage (optional - continue even if this fails)
      let storageDeleted = false;
      try {
        // Extract file path from the URL
        const url = new URL(upload.file_url);
        console.log('Full file URL:', upload.file_url);
        console.log('URL pathname:', url.pathname);
        
        // For Supabase storage URLs, the path typically looks like:
        // /storage/v1/object/public/uploads/user-id/filename
        const pathParts = url.pathname.split('/');
        console.log('Path parts:', pathParts);
        
        // Find the uploads bucket part and extract everything after it
        const uploadsIndex = pathParts.findIndex(part => part === 'uploads');
        if (uploadsIndex !== -1 && uploadsIndex < pathParts.length - 1) {
          const filePath = pathParts.slice(uploadsIndex + 1).join('/');
          console.log('Extracted file path for storage deletion:', filePath);
          
          const { error: storageError } = await supabase.storage
            .from('uploads')
            .remove([filePath]);

          if (storageError) {
            console.error('Storage deletion error:', storageError);
          } else {
            console.log('File successfully deleted from storage');
            storageDeleted = true;
          }
        } else {
          console.warn('Could not extract file path from URL for storage deletion');
        }
      } catch (storageError) {
        console.error('Storage deletion failed:', storageError);
      }

      // Step 3: Delete the main upload record
      console.log('Attempting to delete upload record from database...');
      
      // Use service role key for this operation to bypass RLS if needed
      const { error: dbError } = await supabase
        .from('uploads')
        .delete()
        .eq('id', upload.id)
        .eq('user_id', user.id);

      if (dbError) {
        console.error('Database deletion error:', dbError);
        throw new Error(`Failed to delete from database: ${dbError.message}`);
      }

      console.log('Upload record successfully deleted from database');
      
      // Step 4: Verify deletion by trying to fetch the record
      console.log('Verifying deletion...');
      const { data: verifyData, error: verifyError } = await supabase
        .from('uploads')
        .select('id')
        .eq('id', upload.id)
        .maybeSingle();

      if (verifyData === null) {
        console.log('Deletion verified - record no longer exists');
      } else if (verifyData) {
        console.error('WARNING: Record still exists after deletion!', verifyData);
        throw new Error('Record was not properly deleted from database');
      }
      
      // Step 5: Close modal and navigate back with refresh trigger
      setShowDeleteModal(false);
      setDeleting(false);
      
      // Navigate back immediately
      router.push('/');
      
      // Show success message after navigation
      setTimeout(() => {
        Alert.alert(
          'Success', 
          `"${upload.generated_name || upload.file_name}" has been deleted successfully.${storageDeleted ? '' : ' (Note: File may still exist in storage)'}`
        );
      }, 100);
      
    } catch (error) {
      console.error('Deletion process failed:', error);
      setShowDeleteModal(false);
      setDeleting(false);
      
      Alert.alert(
        'Delete Failed', 
        `Failed to delete the item: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleDeletePress = () => {
    console.log('=== DELETE BUTTON PRESSED ===');
    setShowDropdownMenu(false);
    
    // Add a small delay to ensure dropdown closes smoothly
    setTimeout(() => {
      console.log('Opening delete confirmation modal');
      setShowDeleteModal(true);
    }, 150);
  };

  const handleSettingsPress = () => {
    console.log('=== SETTINGS BUTTON PRESSED ===');
    setShowDropdownMenu(false);
    
    // Navigate to settings page
    setTimeout(() => {
      router.push('/settings');
    }, 150);
  };

  const handleDownloadPress = async () => {
    console.log('=== DOWNLOAD BUTTON PRESSED ===');
    setShowDropdownMenu(false);
    
    if (!upload || !upload.file_url) {
      Alert.alert('Error', 'No file available for download');
      return;
    }

    try {
      // For React Native, we need to use a different approach
      // Create a modified URL that preserves the filename for download
      const originalUrl = upload.file_url;
      const displayFileName = upload.generated_name || upload.file_name;
      
      // Try to create a blob URL with proper filename (for web environments)
      if (typeof window !== 'undefined' && window.document) {
        // Web environment - use blob download with correct filename
        const response = await fetch(originalUrl);
        const blob = await response.blob();
        
        // Create a temporary URL for the blob
        const url = URL.createObjectURL(blob);
        
        // Create a temporary link element to trigger download with correct filename
        const link = document.createElement('a');
        link.href = url;
        link.download = displayFileName; // Use the renamed/display filename
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log(`File downloaded with filename: ${displayFileName}`);
      } else {
        // Mobile environment - use Linking with notification about filename
        const supported = await Linking.canOpenURL(originalUrl);
        
        if (supported) {
          await Linking.openURL(originalUrl);
          // Show user what the display name should be since we can't control the download filename
          Alert.alert(
            'Download Started', 
            `File is downloading. Display name: "${displayFileName}"`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Error', 'Unable to download file. Please try again later.');
        }
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      
      // Fallback to opening URL directly
      try {
        const supported = await Linking.canOpenURL(upload.file_url);
        if (supported) {
          await Linking.openURL(upload.file_url);
          Alert.alert(
            'Download Started', 
            `File is downloading. Display name: "${upload.generated_name || upload.file_name}"`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Error', 'Unable to download file. Please try again later.');
        }
      } catch (fallbackError) {
        console.error('Fallback download also failed:', fallbackError);
        Alert.alert('Error', 'Failed to download file. Please try again later.');
      }
    }
  };

  // Handle file name editing
  const startEditingFileName = () => {
    if (!upload) return;
    setEditingFileName(upload.generated_name || upload.file_name);
    setIsEditingFileName(true);
  };

  const cancelEditingFileName = () => {
    setIsEditingFileName(false);
    setEditingFileName('');
  };

  const validateFileName = (fileName: string): string | null => {
    // Trim whitespace
    const trimmedName = fileName.trim();
    
    // Check if empty
    if (!trimmedName) {
      return 'File name cannot be empty';
    }
    
    // Check for illegal characters (common across different file systems)
    const illegalChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (illegalChars.test(trimmedName)) {
      return 'File name contains illegal characters';
    }
    
    // Check if it's just dots or spaces
    if (/^[\s.]+$/.test(trimmedName)) {
      return 'File name cannot be only dots or spaces';
    }
    
    // Check length (most file systems support up to 255 characters)
    if (trimmedName.length > 255) {
      return 'File name is too long (maximum 255 characters)';
    }
    
    // Check for reserved names (Windows)
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    const nameWithoutExtension = trimmedName.split('.')[0].toUpperCase();
    if (reservedNames.includes(nameWithoutExtension)) {
      return 'File name is reserved and cannot be used';
    }
    
    return null; // Valid
  };

  const saveFileName = async () => {
    if (!upload || !user) return;
    
    const validationError = validateFileName(editingFileName);
    if (validationError) {
      Alert.alert('Invalid File Name', validationError);
      return;
    }
    
    const trimmedName = editingFileName.trim();
    
    // Check if name actually changed
    if (trimmedName === (upload.generated_name || upload.file_name)) {
      setIsEditingFileName(false);
      return;
    }
    
    setIsUpdatingFileName(true);
    
    try {
      const { error } = await supabase
        .from('uploads')
        .update({ generated_name: trimmedName })
        .eq('id', upload.id)
        .eq('user_id', user.id);
      
      if (error) {
        console.error('Error updating file name:', error);
        Alert.alert('Error', 'Failed to update file name. Please try again.');
        return;
      }
      
      // Update local state
      setUpload(prev => prev ? { ...prev, generated_name: trimmedName } : null);
      setIsEditingFileName(false);
      setEditingFileName('');
      
      console.log(`File name updated successfully: "${upload.generated_name || upload.file_name}" -> "${trimmedName}"`);
      
    } catch (error) {
      console.error('Error updating file name:', error);
      Alert.alert('Error', 'Failed to update file name. Please try again.');
    } finally {
      setIsUpdatingFileName(false);
    }
  };

  const handleFileNameSubmit = () => {
    saveFileName();
  };

  // Folder management functions
  const fetchFolders = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('folders')
        .select('id, name, color, description')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setFolders(data || []);
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  const fetchCurrentFolders = async () => {
    if (!user || !upload) return;

    try {
      const { data, error } = await supabase
        .from('upload_folders')
        .select('folder_id')
        .eq('upload_id', upload.id);

      if (error) throw error;

      const folderIds = new Set((data || []).map(item => item.folder_id));
      setCurrentFolders(folderIds);
      setSelectedFolders(new Set(folderIds)); // Initialize selected with current
    } catch (error) {
      console.error('Error fetching current folders:', error);
    }
  };

  const handleFoldersPress = async () => {
    setShowDropdownMenu(false);
    await fetchFolders();
    await fetchCurrentFolders();
    
    setTimeout(() => {
      setShowFolderModal(true);
    }, 150);
  };

  const handleToggleFolder = (folderId: string) => {
    const newSelected = new Set(selectedFolders);
    if (newSelected.has(folderId)) {
      newSelected.delete(folderId);
    } else {
      newSelected.add(folderId);
    }
    setSelectedFolders(newSelected);
  };

  const handleSaveFolders = async () => {
    if (!upload) return;

    try {
      // Get folders to add and remove
      const foldersToAdd = Array.from(selectedFolders).filter(id => !currentFolders.has(id));
      const foldersToRemove = Array.from(currentFolders).filter(id => !selectedFolders.has(id));

      // Remove from folders
      if (foldersToRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('upload_folders')
          .delete()
          .eq('upload_id', upload.id)
          .in('folder_id', foldersToRemove);

        if (removeError) throw removeError;
      }

      // Add to folders
      if (foldersToAdd.length > 0) {
        const insertData = foldersToAdd.map(folderId => ({
          upload_id: upload.id,
          folder_id: folderId,
        }));

        const { error: addError } = await supabase
          .from('upload_folders')
          .insert(insertData);

        if (addError) throw addError;
      }

      // Update current folders
      setCurrentFolders(new Set(selectedFolders));
      setShowFolderModal(false);

    } catch (error) {
      console.error('Error updating folders:', error);
      Alert.alert('Error', 'Failed to update folders');
    }
  };

  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('folders')
        .insert({
          user_id: user.id,
          name: newFolderName.trim(),
          description: newFolderDescription.trim() || null,
          color: newFolderColor,
        })
        .select('id, name, color, description')
        .single();

      if (error) throw error;

      // Add the new folder to the list and select it
      if (data) {
        setFolders(prev => [data, ...prev]);
        setSelectedFolders(prev => new Set([...prev, data.id]));
      }

      // Reset form and close modal
      setNewFolderName('');
      setNewFolderDescription('');
      setNewFolderColor('#3B82F6');
      setShowCreateFolderModal(false);
    } catch (error) {
      console.error('Error creating folder:', error);
      Alert.alert('Error', 'Failed to create folder');
    }
  };

  const handleConfirmDelete = () => {
    console.log('=== DELETE CONFIRMED ===');
    handleDelete();
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
      const transcriptionText = upload.transcriptions[0].transcription_text;
      
      // Try to parse as JSON (new format with complete Eleven Labs response)
      try {
        const transcriptionData: ElevenLabsTranscription = JSON.parse(transcriptionText);
        return transcriptionData.text || transcriptionText;
      } catch (error) {
        // If parsing fails, treat as plain text (fallback for old data)
        return transcriptionText;
      }
    } else if (upload.file_type === 'document' && upload.document_texts && upload.document_texts.length > 0) {
      return upload.document_texts[0].extracted_text;
    }
    
    return 'No content available';
  };

  const renderTranscriptionWithTimestamps = () => {
    if (!upload || upload.file_type !== 'audio') {
      return <Text style={styles.contentText}>{getContentText()}</Text>;
    }

    const transcriptionData = getTranscriptionData();
    
    if (!transcriptionData || !transcriptionData.words || transcriptionData.words.length === 0) {
      console.log('No word-level data found, falling back to plain text');
      return <Text style={styles.contentText}>{getContentText()}</Text>;
    }

    const speakerParagraphs = createSpeakerParagraphs(transcriptionData.words);
    console.log('Rendering speaker paragraphs:', speakerParagraphs.length);

    return (
      <View>
        {speakerParagraphs.map((paragraph, paragraphIndex) => (
          <View key={paragraphIndex} style={styles.speakerParagraphContainer}>
            <Text style={styles.speakerLabel}>
              {paragraph.speaker.replace('_', ' ').toUpperCase()}
            </Text>
            <Text style={styles.paragraphText}>
              {paragraph.segments.map((segment, segmentIndex) => {
                const segmentId = `${paragraphIndex}-${segmentIndex}`;
                const isActiveSegment = activeSegmentId === segmentId;
                const isHoveredSegment = hoveredSegmentId === segmentId;
                const isSelectedSegment = selectedSegmentId === segmentId;
                
                console.log(`Rendering segment ${segmentId}: "${segment.text}" (${segment.start}s - ${segment.end}s), active: ${isActiveSegment}, hovered: ${isHoveredSegment}`);
                
                return (
                  <Text
                    key={segmentIndex}
                    onPress={async () => {
                      console.log(`Clicked segment: "${segment.text}" at ${segment.start}s`);
                      
                      if (isSelectedSegment) {
                        // Second click on same segment - load audio and seek
                        console.log('Second click - loading audio and seeking');
                        if (isCurrentlyPlaying && sound) {
                          await seekToPosition(segment.start);
                        } else {
                          await loadAudio();
                          // After loading, seek to the position
                          setTimeout(() => {
                            seekToPosition(segment.start);
                          }, 500); // Give time for audio to load
                        }
                      } else {
                        // First click - just highlight the segment
                        console.log('First click - highlighting segment');
                        setSelectedSegmentId(segmentId);
                      }
                    }}
                    onLongPress={() => {
                      console.log(`Long press on segment: ${segmentId}`);
                      setHoveredSegmentId(segmentId);
                      setTimeout(() => setHoveredSegmentId(null), 200);
                    }}
                    style={[
                      styles.segmentText,
                      isActiveSegment && !isHoveredSegment && !isSelectedSegment && styles.activeSegmentText,
                      isHoveredSegment && styles.hoveredSegmentText,
                      isSelectedSegment && styles.selectedSegmentText,
                    ]}
                  >
                    {segment.text}
                    {segmentIndex < paragraph.segments.length - 1 ? ' ' : ''}
                  </Text>
                );
              })}
            </Text>
          </View>
        ))}
      </View>
    );
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
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading content...</Text>
      </View>
    );
  }

  if (!upload) {
    return (
      <View style={styles.errorContainer}>
        <FileText size={48} color={colors.textSecondary} />
        <Text style={styles.errorTitle}>Content not found</Text>
        <Text style={styles.errorDescription}>
          The requested content could not be found or you don't have permission to view it.
        </Text>
        <TouchableOpacity style={styles.errorBackButton} onPress={() => router.push('/')}>
          <Text style={styles.errorBackButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header - Simple with back button and menu */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.push('/')}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.menuButton} 
          onPress={() => {
            console.log('Menu button pressed');
            setShowDropdownMenu(true);
          }}
          activeOpacity={0.7}
        >
          <Menu size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* File Information Section - Clean without bounding box */}
      <View style={styles.fileInfoSection}>
        {isEditingFileName ? (
          <View style={styles.fileNameEditContainer}>
            <TextInput
              style={styles.fileNameInput}
              value={editingFileName}
              onChangeText={setEditingFileName}
              onSubmitEditing={handleFileNameSubmit}
              onBlur={saveFileName}
              multiline={true}
              numberOfLines={2}
              autoFocus={true}
              returnKeyType="done"
              blurOnSubmit={true}
              placeholder="Enter file name"
              placeholderTextColor={colors.textSecondary}
            />
            {isUpdatingFileName && (
              <ActivityIndicator 
                size="small" 
                color={colors.primary} 
                style={styles.fileNameLoader}
              />
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.fileNameContainer}
            onPress={startEditingFileName}
            activeOpacity={0.7}
          >
            <Text style={styles.fileName} numberOfLines={2}>
              {upload.generated_name || upload.file_name}
            </Text>
          </TouchableOpacity>
        )}
        <Text style={styles.fileType}>
          {upload.file_type === 'audio' ? 'Audio Recording' : 'Document'}
        </Text>
        <Text style={styles.fileMetadata}>
          {formatFileSize(upload.file_size)} • {formatDate(upload.created_at)}
        </Text>
        <View style={styles.statusBadge}>
          <View style={[
            styles.statusDot, 
            { backgroundColor: upload.status === 'completed' ? colors.success : colors.warning }
          ]} />
          <Text style={[
            styles.statusText,
            { color: upload.status === 'completed' ? colors.success : colors.warning }
          ]}>
            {upload.status === 'completed' ? 'Processed' : 'Processing'}
          </Text>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => scrollToSection(summaryRef)}
          activeOpacity={0.7}
        >
          <FileText size={16} color={colors.textSecondary} />
          <Text style={styles.tabText}>
            Summary
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tab}
          onPress={() => scrollToSection(keyPointsRef)}
          activeOpacity={0.7}
        >
          <List size={16} color={colors.textSecondary} />
          <Text style={styles.tabText}>
            Key Points
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tab}
          onPress={() => scrollToSection(contentRef)}
          activeOpacity={0.7}
        >
          <MessageSquare size={16} color={colors.textSecondary} />
          <Text style={styles.tabText}>
            {upload.file_type === 'audio' ? 'Transcription' : 'Text'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.contentContainer} 
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Section */}
        <View ref={summaryRef} style={styles.contentSection}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.contentText}>
            {getSummaryText()}
          </Text>
        </View>

        {/* Key Points Section */}
        <View ref={keyPointsRef} style={styles.contentSection}>
          <Text style={styles.sectionTitle}>Key Points</Text>
          {getKeyPoints().length > 0 ? (
            getKeyPoints().map((point, index) => (
              <View key={index} style={styles.keyPointItem}>
                <View style={styles.keyPointHeader}>
                  <View style={styles.keyPointNumber}>
                    <Text style={styles.keyPointNumberText}>{index + 1}</Text>
                  </View>
                </View>
                <Text style={styles.keyPointText}>{point.point_text}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <List size={32} color={colors.textSecondary} />
              <Text style={styles.emptyStateText}>No key points available</Text>
            </View>
          )}
        </View>

        {/* Audio Player Section - Only for audio files */}
        {upload.file_type === 'audio' && (
          <View style={styles.audioPlayerSection}>
            <Text style={styles.sectionTitle}>Audio Player</Text>
            <View style={styles.audioPlayerControls}>
              <TouchableOpacity
                style={styles.playButton}
                onPress={togglePlayback}
                disabled={audioLoading}
                activeOpacity={0.7}
              >
                {audioLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : isPlaying ? (
                  <Pause size={20} color="#FFFFFF" />
                ) : (
                  <Play size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
              
              <View style={styles.audioInfo}>
                <Text style={styles.audioTime}>
                  {formatTime(currentPosition)} / {duration > 0 ? formatTime(duration) : '--:--'}
                </Text>
                <View style={styles.progressContainer}>
                  <TouchableOpacity
                    style={styles.progressBar}
                    onLayout={(event) => {
                      const { width } = event.nativeEvent.layout;
                      setProgressBarWidth(width);
                      console.log(`Progress bar width set to: ${width}px`);
                    }}
                    onPress={async (event) => {
                      console.log('Progress bar clicked!');
                      
                      // Get the current width in case it wasn't set in onLayout yet
                      const currentWidth = progressBarWidth > 0 ? progressBarWidth : 200; // fallback
                      const { locationX } = event.nativeEvent;
                      const percentage = Math.max(0, Math.min(1, locationX / currentWidth));
                      
                      console.log(`Progress bar clicked:
                        - locationX: ${locationX}px
                        - progressBarWidth: ${currentWidth}px
                        - percentage: ${(percentage * 100).toFixed(1)}%
                        - duration: ${duration.toFixed(2)}s
                        - isCurrentlyPlaying: ${isCurrentlyPlaying}`);
                      
                      // If not currently playing this audio, load it first
                      if (!isCurrentlyPlaying || !sound) {
                        console.log('Loading audio first...');
                        await loadAudio(); // This will load and start playing
                        
                        // Wait for audio to be fully loaded and duration to be available
                        let attempts = 0;
                        const maxAttempts = 20; // 2 seconds maximum wait
                        
                        while (duration === 0 && attempts < maxAttempts) {
                          console.log(`Waiting for duration... attempt ${attempts + 1}`);
                          await new Promise(resolve => setTimeout(resolve, 100));
                          attempts++;
                        }
                        
                        if (duration === 0) {
                          console.log('Could not get audio duration after loading');
                          Alert.alert('Error', 'Could not load audio duration');
                          return;
                        }
                      }
                      
                      // Now we should have both sound and duration
                      if (duration > 0) {
                        const newPosition = percentage * duration;
                        console.log(`Seeking to position: ${newPosition.toFixed(2)}s of ${duration.toFixed(2)}s`);
                        await seekToPosition(newPosition);
                      } else {
                        console.log('Cannot seek - duration is still 0');
                        Alert.alert('Error', 'Audio duration not available');
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <View 
                      style={[
                        styles.progressFill, 
                        { width: duration > 0 ? `${(currentPosition / duration) * 100}%` : '0%' }
                      ]} 
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Content/Transcription Section */}
        <View ref={contentRef} style={styles.contentSection}>
          <Text style={styles.sectionTitle}>
            {upload.file_type === 'audio' ? 'Transcription' : 'Document Text'}
          </Text>
          
          {upload.file_type === 'audio' ? 
            renderTranscriptionWithTimestamps() : 
            <Text style={styles.contentText}>{getContentText()}</Text>
          }
        </View>

        {/* Bolt Logo at bottom */}
        <BoltLogo style={styles.boltLogo} />
      </ScrollView>

      {/* Dropdown Menu Modal */}
      <Modal
        visible={showDropdownMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          console.log('Dropdown overlay pressed - closing menu');
          setShowDropdownMenu(false);
        }}
      >
        <TouchableOpacity 
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => {
            console.log('Dropdown overlay pressed - closing menu');
            setShowDropdownMenu(false);
          }}
        >
          <View style={styles.dropdownMenu}>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={handleFoldersPress}
              activeOpacity={0.7}
            >
              <FolderPlus size={20} color={colors.text} />
              <Text style={styles.dropdownItemText}>Manage Folders</Text>
            </TouchableOpacity>
            
            <View style={styles.dropdownDivider} />
            
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={handleDownloadPress}
              activeOpacity={0.7}
            >
              <Download size={20} color={colors.text} />
              <Text style={styles.dropdownItemText}>Download File</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={handleSettingsPress}
              activeOpacity={0.7}
            >
              <Settings size={20} color={colors.text} />
              <Text style={styles.dropdownItemText}>Settings</Text>
            </TouchableOpacity>
            
            <View style={styles.dropdownDivider} />
            
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={handleDeletePress}
              activeOpacity={0.7}
            >
              <Trash2 size={20} color={colors.error} />
              <Text style={[styles.dropdownItemText, { color: colors.error }]}>Delete Item</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!deleting) {
            console.log('Delete modal dismissed');
            setShowDeleteModal(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModal}>
            <View style={styles.deleteIconContainer}>
              <Trash2 size={32} color={colors.error} />
            </View>
            
            <Text style={styles.deleteTitle}>Delete Item</Text>
            <Text style={styles.deleteMessage}>
              Are you sure you want to delete "{upload.generated_name || upload.file_name}"? This action cannot be undone and will remove all associated content including transcriptions, summaries, and key points.
            </Text>
            
            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={[styles.cancelButton, deleting && styles.buttonDisabled]}
                onPress={() => {
                  if (!deleting) {
                    console.log('Delete cancelled');
                    setShowDeleteModal(false);
                  }
                }}
                disabled={deleting}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
                onPress={handleConfirmDelete}
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

      {/* Folder Management Modal */}
      <Modal
        visible={showFolderModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowFolderModal(false)}
          />
          
          <View style={styles.folderModal}>
            <View style={styles.folderModalHeader}>
              <Text style={styles.folderModalTitle}>Manage Folders</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowFolderModal(false)}
                activeOpacity={0.7}
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.folderModalSubtitle}>
              Select folders for "{upload?.generated_name || upload?.file_name}"
            </Text>

            <ScrollView style={styles.folderList} showsVerticalScrollIndicator={false}>
              {/* Create New Folder Option */}
              <TouchableOpacity
                style={styles.createFolderOption}
                onPress={() => {
                  setShowFolderModal(false);
                  setTimeout(() => setShowCreateFolderModal(true), 300);
                }}
                activeOpacity={0.7}
              >
                <Plus size={16} color={colors.primary} />
                <Text style={[styles.folderOptionText, { color: colors.primary }]}>Create New Folder</Text>
              </TouchableOpacity>
              
              {folders.length > 0 && <View style={styles.folderDivider} />}

              {folders.length === 0 ? (
                <View style={styles.noFoldersContainer}>
                  <Text style={styles.noFoldersText}>No folders available</Text>
                </View>
              ) : (
                folders.map(folder => (
                  <TouchableOpacity
                    key={folder.id}
                    style={[
                      styles.folderOption,
                      selectedFolders.has(folder.id) && styles.selectedFolderOption
                    ]}
                    onPress={() => handleToggleFolder(folder.id)}
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
                      selectedFolders.has(folder.id) && styles.checkedCheckbox
                    ]}>
                      {selectedFolders.has(folder.id) && (
                        <CheckCircle size={20} color={colors.primary} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <View style={styles.folderModalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowFolderModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.saveFoldersButton}
                onPress={handleSaveFolders}
                activeOpacity={0.7}
              >
                <Text style={styles.saveFoldersButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Folder Modal */}
      <Modal
        visible={showCreateFolderModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCreateFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowCreateFolderModal(false)}
          />
          
          <View style={styles.createFolderModal}>
            <View style={styles.folderModalHeader}>
              <Text style={styles.folderModalTitle}>Create New Folder</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowCreateFolderModal(false)}
                activeOpacity={0.7}
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.folderModalSubtitle}>
              Organize your uploads by creating a new folder
            </Text>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Folder Name</Text>
              <TextInput
                style={styles.formInput}
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="Enter folder name"
                placeholderTextColor={colors.textSecondary}
                maxLength={50}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.formInput, styles.textArea]}
                value={newFolderDescription}
                onChangeText={setNewFolderDescription}
                placeholder="Enter folder description"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Color</Text>
              <View style={styles.colorPicker}>
                {folderColors.map(color => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      newFolderColor === color && styles.selectedColorOption
                    ]}
                    onPress={() => setNewFolderColor(color)}
                    activeOpacity={0.7}
                  />
                ))}
              </View>
            </View>

            <View style={styles.folderModalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateFolderModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.saveFoldersButton, !newFolderName.trim() && styles.disabledButton]}
                onPress={handleCreateFolder}
                disabled={!newFolderName.trim()}
                activeOpacity={0.7}
              >
                <Text style={styles.saveFoldersButtonText}>Create Folder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.background,
    },
    errorTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    errorDescription: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 24,
    },
    errorBackButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    errorBackButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    // Header - Simple top bar
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
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    // Back button - matching menu button style exactly
    backButton: {
      width: 38,
      height: 38,
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
    menuButton: {
      width: 38,
      height: 38,
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
    // File Information Section - Clean without bounding box
    fileInfoSection: {
      backgroundColor: colors.surface,
      paddingHorizontal: 20,
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    fileNameContainer: {
      marginBottom: 8,
      minHeight: 36,
      justifyContent: 'center',
    },
    fileName: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      lineHeight: 32,
    },
    fileNameEditContainer: {
      marginBottom: 8,
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
    },
    fileNameInput: {
      flex: 1,
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      lineHeight: 32,
      backgroundColor: colors.background,
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      textAlignVertical: 'top',
    },
    fileNameLoader: {
      marginLeft: 12,
    },
    fileType: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
      marginBottom: 4,
    },
    fileMetadata: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 12,
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
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 12,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
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
    tabText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    contentContainer: {
      flex: 1,
      margin: 16,
    },
    contentSection: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 16,
    },
    contentText: {
      fontSize: 16,
      lineHeight: 24,
      color: colors.text,
    },
    keyPointItem: {
      marginBottom: 20,
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    keyPointHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    keyPointNumber: {
      width: 24,
      height: 24,
      backgroundColor: colors.primary,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyPointNumberText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
    },
    keyPointText: {
      fontSize: 16,
      lineHeight: 24,
      color: colors.text,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
    },
    emptyStateText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: 12,
    },
    // Dropdown menu styles (matching library screen)
    dropdownOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingTop: 110,
      paddingRight: 16,
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
    dropdownDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 4,
      marginHorizontal: 12,
    },
    dropdownItemText: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'flex-end',
    },
    deleteModal: {
      backgroundColor: colors.surface,
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
      backgroundColor: colors.error + '15',
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    deleteTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    deleteMessage: {
      fontSize: 16,
      color: colors.textSecondary,
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
      backgroundColor: colors.border + '40',
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    deleteButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: colors.error,
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
    buttonDisabled: {
      opacity: 0.6,
    },
    // Audio player styles
    audioPlayerSection: {
      backgroundColor: colors.background,
      borderRadius: 16,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
      marginBottom: 16,
    },
    audioPlayerControls: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 16,
    },
    playButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    audioInfo: {
      flex: 1,
    },
    audioTime: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    progressContainer: {
      width: '100%',
    },
    progressBar: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: 'hidden',
      marginVertical: 2,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 3,
    },
    // Speaker-based transcription styles
    speakerParagraphContainer: {
      marginBottom: 20,
    },
    speakerLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 8,
      letterSpacing: 0.5,
    },
    paragraphContainer: {
      paddingVertical: 4,
    },
    paragraphText: {
      fontSize: 16,
      lineHeight: 26,
      color: colors.text,
    },
    wordText: {
      fontSize: 16,
      lineHeight: 26,
      color: colors.text,
    },
    activeWordText: {
      backgroundColor: colors.primary + '60',
      color: colors.text,
      fontWeight: '600',
    },
    segmentText: {
      // Inherit styles from parent paragraphText
    },
    activeSegmentText: {
      backgroundColor: colors.primary + '40',
      color: colors.text,
      fontWeight: '600',
    },
    hoveredSegmentText: {
      backgroundColor: colors.primary + '20',
      color: colors.text,
      fontWeight: '500',
    },
    selectedSegmentText: {
      backgroundColor: colors.primary + '30',
      color: colors.text,
      fontWeight: '500',
    },
    // Legacy transcription styles (kept for fallback)
    transcriptionSegmentContainer: {
      marginVertical: 4,
      borderRadius: 12,
      overflow: 'hidden',
    },
    transcriptionSegment: {
      padding: 16,
      borderRadius: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
    },
    activeSegmentContainer: {
      backgroundColor: colors.primary + '20',
      borderWidth: 2,
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    hoveredSegmentContainer: {
      backgroundColor: colors.primary + '10',
      borderWidth: 1,
      borderColor: colors.primary + '60',
    },
    activeSegment: {
      backgroundColor: colors.primary + '25',
      borderLeftWidth: 6,
      borderLeftColor: colors.primary,
      paddingLeft: 20,
    },
    hoveredSegment: {
      backgroundColor: colors.primary + '15',
      borderLeftWidth: 3,
      borderLeftColor: colors.primary + '80',
      paddingLeft: 18,
    },
    timestampContainer: {
      marginRight: 8,
      marginBottom: 4,
    },
    activeTimestampContainer: {
      transform: [{ scale: 1.05 }],
    },
    hoveredTimestampContainer: {
      transform: [{ scale: 1.02 }],
    },
    timestampText: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: '700',
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
    },
    activeTimestamp: {
      backgroundColor: colors.primary,
      color: '#FFFFFF',
      fontWeight: '800',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.5,
      shadowRadius: 2,
      elevation: 2,
    },
    hoveredTimestamp: {
      backgroundColor: colors.primary + '30',
      color: colors.primary,
      fontWeight: '700',
    },
    noTimestampSegment: {
      opacity: 0.8,
    },
    // Folder modal styles
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    folderModal: {
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
    createFolderModal: {
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
    folderModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    folderModalTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    closeButton: {
      padding: 4,
    },
    folderModalSubtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    folderList: {
      maxHeight: 300,
      marginBottom: 20,
    },
    noFoldersContainer: {
      alignItems: 'center',
      padding: 32,
    },
    noFoldersText: {
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
    createFolderOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.primary + '10',
    },
    folderDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 4,
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
    folderModalActions: {
      flexDirection: 'row',
      gap: 12,
    },
    saveFoldersButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    saveFoldersButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    // Form styles for create folder modal
    formSection: {
      marginBottom: 20,
    },
    formLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    formInput: {
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
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 3,
      borderColor: 'transparent',
    },
    selectedColorOption: {
      borderColor: colors.text,
    },
    folderOptionText: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    disabledButton: {
      opacity: 0.5,
    },
    boltLogo: {
      marginTop: 20,
      marginBottom: 10,
    },
  });
}