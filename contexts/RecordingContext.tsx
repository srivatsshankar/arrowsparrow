import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { convertAudioToWav } from '@/lib/audioUtils';

interface RecordingContextType {
  // Recording state
  recording: Audio.Recording | null;
  isRecording: boolean;
  showRecordingScreen: boolean;
  recordingInBackground: boolean;
  recordingDuration: number;
  isPaused: boolean;
  audioLevels: number[];
  
  // Upload/Processing state
  isUploading: boolean;
  uploadProgress: number;
  lastUploadedFileName: string | null;
  
  // Recording controls
  startRecording: (folderId?: string | null) => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  minimizeRecording: () => void;
  returnToRecording: () => void;
  
  // File upload handler
  handleFileUpload: (uri: string, fileType: 'audio' | 'document', fileName: string, knownDuration?: number, folderId?: string | null) => Promise<void>;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showRecordingScreen, setShowRecordingScreen] = useState(false);
  const [recordingInBackground, setRecordingInBackground] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  
  // Upload/Processing state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastUploadedFileName, setLastUploadedFileName] = useState<string | null>(null);
  const [currentRecordingFolderId, setCurrentRecordingFolderId] = useState<string | null>(null);
  
  const recordingTimerRef = useRef<number | null>(null);
  const audioLevelIntervalRef = useRef<number | null>(null);
  const maxRecordingTime = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

  // Cleanup recording timers on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
      }
    };
  }, []);

  const startRecording = async (folderId?: string | null) => {
    try {
      // Store the folder ID for this recording session
      setCurrentRecordingFolderId(folderId || null);
      
      // Request microphone permission for all platforms
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Please grant microphone access to record audio');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          android: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
            sampleRate: 16000, // Use 16kHz for consistency with target conversion
            numberOfChannels: 1, // Mono recording
            bitRate: 64000, // Lower bit rate for smaller files
          },
          ios: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
            sampleRate: 16000, // Use 16kHz for consistency with target conversion
            numberOfChannels: 1, // Mono recording
            bitRate: 64000, // Lower bit rate for smaller files
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 64000, // Lower bit rate for smaller files
          },
        }
      );
      
      setRecording(recording);
      setIsRecording(true);
      setShowRecordingScreen(true);
      setRecordingInBackground(false);
      setRecordingDuration(0);
      setIsPaused(false);
      setAudioLevels([]);

      // Start timer for recording duration
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1000;
          // Auto-stop at 4 hours
          if (newDuration >= maxRecordingTime) {
            stopRecording();
            return maxRecordingTime;
          }
          return newDuration;
        });
      }, 1000);

      // Simulate audio levels for visualization
      audioLevelIntervalRef.current = setInterval(() => {
        if (!isPaused) {
          setAudioLevels(prev => {
            const newLevel = Math.random() * 0.8 + 0.1; // Random level between 0.1 and 0.9
            const newLevels = [...prev, newLevel];
            // Keep only last 100 levels for performance
            return newLevels.slice(-100);
          });
        }
      }, 100);

    } catch (error) {
      console.error('Failed to start recording', error);
      Alert.alert('Error', 'Failed to start recording. Please check your microphone permissions.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      // Clear timers
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
        audioLevelIntervalRef.current = null;
      }

      setIsRecording(false);
      setShowRecordingScreen(false);
      setRecordingInBackground(false);
      
      // Try to get the actual recording duration before stopping
      let actualRecordingDuration: number | null = null;
      try {
        const recordingStatus = await recording.getStatusAsync();
        if (recordingStatus.isRecording !== undefined && (recordingStatus as any).durationMillis) {
          actualRecordingDuration = (recordingStatus as any).durationMillis / 1000;
          console.log(`📊 Actual recording duration from status: ${actualRecordingDuration.toFixed(2)}s`);
        }
      } catch (statusError) {
        console.warn('Could not get recording status before stopping:', statusError);
      }
      
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (uri) {
        const fileName = `recording_${Date.now()}.wav`; // Changed to .wav extension
        
        // Use the most accurate duration available
        const trackedDurationSeconds = recordingDuration / 1000;
        const durationToUse = actualRecordingDuration || trackedDurationSeconds;
        
        console.log(`🎙️ Recording completed:
          - Tracked Duration: ${trackedDurationSeconds.toFixed(2)}s
          - Actual Duration: ${actualRecordingDuration?.toFixed(2) || 'N/A'}s  
          - Using: ${durationToUse.toFixed(2)}s`);
        
        // Use the duration if it's reasonable (> 0.1 seconds), otherwise let the system calculate it
        const finalDuration = durationToUse > 0.1 ? durationToUse : undefined;
        if (finalDuration) {
          console.log(`✅ Using duration: ${finalDuration.toFixed(2)}s`);
        } else {
          console.log(`⚠️ Duration too short (${durationToUse.toFixed(2)}s), will calculate from file`);
        }
        
        // Pass the known duration to avoid re-calculation
        await handleFileUpload(uri, 'audio', fileName, finalDuration, currentRecordingFolderId);
      }
      
      // Reset recording state
      setRecording(null);
      setRecordingDuration(0);
      setIsPaused(false);
      setAudioLevels([]);
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const pauseRecording = async () => {
    if (!recording || !isRecording) return;

    try {
      if (isPaused) {
        // Resume recording
        await recording.startAsync();
        setIsPaused(false);
        
        // Resume timers
        recordingTimerRef.current = setInterval(() => {
          setRecordingDuration(prev => {
            const newDuration = prev + 1000;
            if (newDuration >= maxRecordingTime) {
              stopRecording();
              return maxRecordingTime;
            }
            return newDuration;
          });
        }, 1000);

        audioLevelIntervalRef.current = setInterval(() => {
          setAudioLevels(prev => {
            const newLevel = Math.random() * 0.8 + 0.1;
            const newLevels = [...prev, newLevel];
            return newLevels.slice(-100);
          });
        }, 100);
      } else {
        // Pause recording
        await recording.pauseAsync();
        setIsPaused(true);
        
        // Clear timers
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        if (audioLevelIntervalRef.current) {
          clearInterval(audioLevelIntervalRef.current);
          audioLevelIntervalRef.current = null;
        }
      }
    } catch (error) {
      console.error('Error pausing/resuming recording:', error);
      Alert.alert('Error', 'Failed to pause/resume recording');
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;

    try {
      // Clear timers
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
        audioLevelIntervalRef.current = null;
      }

      setIsRecording(false);
      setShowRecordingScreen(false);
      setRecordingInBackground(false);
      
      await recording.stopAndUnloadAsync();
      
      // Reset recording state
      setRecording(null);
      setRecordingDuration(0);
      setIsPaused(false);
      setAudioLevels([]);
    } catch (error) {
      console.error('Error canceling recording:', error);
    }
  };

  const minimizeRecording = () => {
    setShowRecordingScreen(false);
    setRecordingInBackground(true);
  };

  const returnToRecording = () => {
    setShowRecordingScreen(true);
    setRecordingInBackground(false);
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

  // Function to calculate audio duration from file URI
  const getAudioDuration = async (uri: string): Promise<number | null> => {
    try {
      console.log('🔍 Calculating audio duration for:', uri);
      
      // For local recordings, add a small delay to ensure file is fully written
      if (uri.includes('ExponentExperienceData') || uri.includes('file://')) {
        console.log('📱 Local recording detected, waiting for file to stabilize...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Create a temporary sound object to get duration
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false }, // Don't play, just load metadata
        null // No status callback needed
      );

      // Wait for metadata to load with more attempts for local recordings
      let attempts = 0;
      const maxAttempts = uri.includes('file://') ? 30 : 20; // More attempts for local files
      
      while (attempts < maxAttempts) {
        try {
          const status = await sound.getStatusAsync();
          
          if (status.isLoaded && (status as any).durationMillis) {
            const durationSeconds = (status as any).durationMillis / 1000;
            
            if (isFinite(durationSeconds) && !isNaN(durationSeconds) && durationSeconds > 0) {
              console.log(`✅ Audio duration calculated: ${durationSeconds.toFixed(2)}s after ${attempts + 1} attempts`);
              
              // Cleanup the temporary sound
              await sound.unloadAsync();
              return durationSeconds;
            }
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            // Progressive delay, longer for local files
            const baseDelay = uri.includes('file://') ? 200 : 100;
            const delay = Math.min(baseDelay + (attempts * 150), 1500);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (statusError) {
          console.warn(`Attempt ${attempts + 1} failed:`, statusError);
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }
      
      console.warn('⚠️ Could not determine audio duration after maximum attempts');
      
      // Cleanup the temporary sound
      try {
        await sound.unloadAsync();
      } catch (cleanupError) {
        console.error('Error cleaning up temporary sound:', cleanupError);
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error calculating audio duration:', error);
      return null;
    }
  };

  const handleFileUpload = async (uri: string, fileType: 'audio' | 'document', fileName: string, knownDuration?: number, folderId?: string | null) => {
    if (!user) return;

    let processedUri = uri;
    let processedFileName = fileName;
    let fileBlob: Blob;

    try {
      // Set uploading state
      setIsUploading(true);
      setUploadProgress(0);
      setLastUploadedFileName(fileName); // Start with original filename

      let audioDuration: number | null = null;

      if (fileType === 'audio') {
        setUploadProgress(5); // Progress: Starting audio conversion
        
        // Only convert audio to WAV on web platform (where Web Audio API is available)
        if (Platform.OS === 'web') {
          try {
            console.log('🎵 Converting audio to WAV format (16kHz max)...');
            const { blob: wavBlob, fileName: wavFileName } = await convertAudioToWav(uri);
            
            // Create a temporary URL for the converted WAV blob
            const wavUrl = URL.createObjectURL(wavBlob);
            processedUri = wavUrl;
            processedFileName = wavFileName;
            fileBlob = wavBlob;
            
            // Update the displayed filename to show the WAV file
            setLastUploadedFileName(wavFileName);
            
            console.log(`✅ Audio converted to WAV: ${wavFileName}`);
            setUploadProgress(15); // Progress: Audio conversion complete
          } catch (conversionError) {
            console.warn('⚠️ Audio conversion failed, uploading original file:', conversionError);
            // Fall back to original file if conversion fails
            const response = await fetch(uri);
            fileBlob = await response.blob();
          }
        } else {
          // On mobile platforms, use original file
          console.log('📱 Mobile platform detected, uploading original audio file');
          const response = await fetch(uri);
          fileBlob = await response.blob();
        }

        setUploadProgress(20); // Progress: Getting duration
        
        if (knownDuration !== undefined && knownDuration > 0) {
          audioDuration = knownDuration;
          console.log(`🎵 Using known audio duration: ${audioDuration.toFixed(2)} seconds`);
        } else {
          console.log('📊 Calculating duration for audio file...');
          audioDuration = await getAudioDuration(processedUri);
          if (audioDuration) {
            console.log(`🎵 Calculated audio duration: ${audioDuration.toFixed(2)} seconds`);
          }
        }
      } else {
        // For documents, just get the blob
        setUploadProgress(10); // Progress: Getting file
        const response = await fetch(uri);
        fileBlob = await response.blob();
      }

      setUploadProgress(30); // Progress: Creating database entry

      // First, create a database entry with "uploaded" status
      const { data: initialDbData, error: initialDbError } = await supabase
        .from('uploads')
        .insert({
          user_id: user.id,
          file_name: processedFileName,
          file_type: fileType,
          file_url: '', // Will be updated after upload
          file_size: 0, // Will be updated after we get file info
          duration: audioDuration, // Add duration for audio files
          status: 'uploaded', // Initial status after successful upload
        })
        .select()
        .single();

      if (initialDbError) {
        console.error('Initial database insert error:', initialDbError);
        Alert.alert('Error', 'Failed to start upload');
        return;
      }

      setUploadProgress(40); // Progress: Getting file info

      // Get file size from the blob
      const fileSize = fileBlob.size;

      // Generate unique file path with versioning
      const uniqueFilePath = await generateUniqueFilePath(user.id, processedFileName);
      console.log('Generated unique file path:', uniqueFilePath);

      setUploadProgress(60); // Progress: Starting upload

      // Upload to Supabase Storage with unique path
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(uniqueFilePath, fileBlob);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw uploadError;
      }

      setUploadProgress(75); // Progress: Upload complete, getting URL

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('uploads')
        .getPublicUrl(uniqueFilePath);

      // Extract the final file name from the unique path for display
      const finalFileName = uniqueFilePath.split('/').pop() || processedFileName;
      const displayFileName = finalFileName.replace(/^\d+_/, ''); // Remove timestamp prefix for display

      setUploadProgress(85); // Progress: Updating database

      // Update database entry with file details and "uploaded" status
      const { data: dbData, error: dbError } = await supabase
        .from('uploads')
        .update({
          file_name: displayFileName, // Use clean display name
          file_url: publicUrl,
          file_size: fileSize,
          status: 'uploaded',
        })
        .eq('id', initialDbData.id)
        .select()
        .single();

      if (dbError) {
        console.error('Database update error:', dbError);
        throw dbError;
      }

      setUploadProgress(90); // Progress: Starting processing
      
      // Trigger processing via edge function
      try {
        const processingResponse = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/process-upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uploadId: initialDbData.id,
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
            .eq('id', initialDbData.id);
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
          .eq('id', initialDbData.id);
      }

      setUploadProgress(100); // Progress: Complete
      
      // Add to folder if specified
      if (folderId && initialDbData?.id) {
        try {
          console.log(`Adding upload ${initialDbData.id} to folder ${folderId}`);
          const { error: folderError } = await supabase
            .from('upload_folders')
            .insert({
              upload_id: initialDbData.id,
              folder_id: folderId,
            });

          if (folderError) {
            console.error('Error adding upload to folder:', folderError);
            // Don't fail the entire upload if folder assignment fails
          } else {
            console.log('Successfully added upload to folder');
          }
        } catch (folderAssignError) {
          console.error('Error assigning to folder:', folderAssignError);
          // Don't fail the entire upload if folder assignment fails
        }
      }
      
      // Clean up temporary URL if we created one
      if (Platform.OS === 'web' && fileType === 'audio' && processedUri !== uri && processedUri.startsWith('blob:')) {
        URL.revokeObjectURL(processedUri);
      }
      
      // Keep the upload indicator visible for a moment to show completion
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setLastUploadedFileName(null);
      }, 2000);
      
    } catch (error) {
      console.error('Upload error:', error);
      
      // Clean up temporary URL if we created one
      if (Platform.OS === 'web' && fileType === 'audio' && processedUri && processedUri !== uri && processedUri.startsWith('blob:')) {
        URL.revokeObjectURL(processedUri);
      }
      
      // Update the database entry to show error if we have the ID
      try {
        await supabase
          .from('uploads')
          .update({ 
            status: 'error',
            error_message: 'Upload failed'
          })
          .eq('file_name', processedFileName || fileName)
          .eq('user_id', user.id);
      } catch (dbError) {
        console.error('Failed to update error status:', dbError);
      }
      
      Alert.alert('Error', 'Failed to upload file');
      
      // Reset upload state
      setIsUploading(false);
      setUploadProgress(0);
      setLastUploadedFileName(null);
    }
  };

  const value: RecordingContextType = {
    recording,
    isRecording,
    showRecordingScreen,
    recordingInBackground,
    recordingDuration,
    isPaused,
    audioLevels,
    isUploading,
    uploadProgress,
    lastUploadedFileName,
    startRecording,
    stopRecording,
    pauseRecording,
    cancelRecording,
    minimizeRecording,
    returnToRecording,
    handleFileUpload,
  };

  return (
    <RecordingContext.Provider value={value}>
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording() {
  const context = useContext(RecordingContext);
  if (context === undefined) {
    throw new Error('useRecording must be used within a RecordingProvider');
  }
  return context;
}
