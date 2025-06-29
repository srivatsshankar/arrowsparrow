import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

interface RecordingContextType {
  // Recording state
  recording: Audio.Recording | null;
  isRecording: boolean;
  showRecordingScreen: boolean;
  recordingInBackground: boolean;
  recordingDuration: number;
  isPaused: boolean;
  audioLevels: number[];
  
  // Recording controls
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  minimizeRecording: () => void;
  returnToRecording: () => void;
  
  // File upload handler
  handleFileUpload: (uri: string, fileType: 'audio' | 'document', fileName: string) => Promise<void>;
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

  const startRecording = async () => {
    try {
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
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 128000,
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
      
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (uri) {
        const fileName = `recording_${Date.now()}.m4a`;
        await handleFileUpload(uri, 'audio', fileName);
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

  const handleFileUpload = async (uri: string, fileType: 'audio' | 'document', fileName: string) => {
    if (!user) return;

    // First, create a database entry with "uploaded" status
    const { data: initialDbData, error: initialDbError } = await supabase
      .from('uploads')
      .insert({
        user_id: user.id,
        file_name: fileName,
        file_type: fileType,
        file_url: '', // Will be updated after upload
        file_size: 0, // Will be updated after we get file info
        status: 'uploaded', // Initial status after successful upload
      })
      .select()
      .single();

    if (initialDbError) {
      console.error('Initial database insert error:', initialDbError);
      Alert.alert('Error', 'Failed to start upload');
      return;
    }

    try {
      // Get file info
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileSize = blob.size;

      // Generate unique file path with versioning
      const uniqueFilePath = await generateUniqueFilePath(user.id, fileName);
      console.log('Generated unique file path:', uniqueFilePath);

      // Upload to Supabase Storage with unique path
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(uniqueFilePath, blob);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('uploads')
        .getPublicUrl(uniqueFilePath);

      // Extract the final file name from the unique path for display
      const finalFileName = uniqueFilePath.split('/').pop() || fileName;
      const displayFileName = finalFileName.replace(/^\d+_/, ''); // Remove timestamp prefix for display

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
      
    } catch (error) {
      console.error('Upload error:', error);
      
      // Update the database entry to show error
      await supabase
        .from('uploads')
        .update({ 
          status: 'error',
          error_message: 'Upload failed'
        })
        .eq('id', initialDbData.id);
      
      Alert.alert('Error', 'Failed to upload file');
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
