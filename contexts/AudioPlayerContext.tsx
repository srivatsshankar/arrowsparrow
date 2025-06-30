import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Database } from '@/types/database';

type Upload = Database['public']['Tables']['uploads']['Row'];
type UploadWithData = Upload & {
  transcriptions?: Array<{ transcription_text: string }>;
  document_texts?: Array<{ extracted_text: string }>;
  summaries?: Array<{ summary_text: string }>;
  key_points?: Array<{ point_text: string; importance_level: number }>;
};

// Types for transcription response
type TranscriptionWord = {
  text: string;
  start: number;
  end: number;
  type: 'word' | 'spacing';
  speakerId?: string;
  logprob?: number;
};

type ElevenLabsTranscription = {
  text: string;
  languageCode?: string;
  languageProbability?: number;
  words?: TranscriptionWord[];
  segments?: Array<{
    text: string;
    start: number;
    end: number;
    speaker?: string;
  }>;
  timestamps?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
};

interface AudioPlayerContextType {
  // Player state
  currentUpload: UploadWithData | null;
  sound: Audio.Sound | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentPosition: number;
  duration: number;
  activeSegmentId: string | null;
  
  // Player controls
  playAudio: (upload: UploadWithData) => Promise<void>;
  togglePlayback: () => Promise<void>;
  seekToPosition: (seconds: number) => Promise<void>;
  stopAudio: () => Promise<void>;
  
  // Transcription data
  getTranscriptionData: () => ElevenLabsTranscription | null;
  
  // UI state
  showMiniPlayer: boolean;
  setShowMiniPlayer: (show: boolean) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentUpload, setCurrentUpload] = useState<UploadWithData | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);
  
  const positionUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.stopAsync().then(() => {
          sound.unloadAsync();
        }).catch(console.error);
      }
      if (positionUpdateIntervalRef.current) {
        clearInterval(positionUpdateIntervalRef.current);
      }
    };
  }, [sound]);

  // Position tracking for segment highlighting
  useEffect(() => {
    if (sound && isPlaying) {
      positionUpdateIntervalRef.current = setInterval(async () => {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded && status.positionMillis !== undefined) {
            const positionSeconds = status.positionMillis / 1000;
            setCurrentPosition(positionSeconds);
            
            // Find active segment based on current position
            const transcriptionData = getTranscriptionData();
            if (transcriptionData && transcriptionData.words && transcriptionData.words.length > 0) {
              const speakerParagraphs = createSpeakerParagraphs(transcriptionData.words);
              let activeSegmentId: string | null = null;
              
              for (let paragraphIndex = 0; paragraphIndex < speakerParagraphs.length; paragraphIndex++) {
                const paragraph = speakerParagraphs[paragraphIndex];
                for (let segmentIndex = 0; segmentIndex < paragraph.segments.length; segmentIndex++) {
                  const segment = paragraph.segments[segmentIndex];
                  
                  if (positionSeconds >= segment.start && positionSeconds <= segment.end) {
                    activeSegmentId = `${paragraphIndex}-${segmentIndex}`;
                    break;
                  }
                }
                if (activeSegmentId) break;
              }
              
              setActiveSegmentId(activeSegmentId);
            }
          }
        } catch (error) {
          console.error('Error getting audio status:', error);
        }
      }, 100);
    } else {
      if (positionUpdateIntervalRef.current) {
        clearInterval(positionUpdateIntervalRef.current);
        positionUpdateIntervalRef.current = null;
      }
      if (!isPlaying) {
        setActiveSegmentId(null);
      }
    }
    
    return () => {
      if (positionUpdateIntervalRef.current) {
        clearInterval(positionUpdateIntervalRef.current);
        positionUpdateIntervalRef.current = null;
      }
    };
  }, [sound, isPlaying, currentUpload]);

  const onAudioStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      // Log raw status for debugging with less verbosity for successful cases
      const logLevel = status.durationMillis && status.durationMillis > 0 ? 'debug' : 'info';
      if (logLevel === 'info') {
        console.log('🎵 Audio status update:', {
          durationMillis: status.durationMillis,
          positionMillis: status.positionMillis,
          isPlaying: status.isPlaying,
          didJustFinish: status.didJustFinish
        });
      }
      
      // Handle duration with comprehensive validation for m4a files
      let newDuration = null;
      if (status.durationMillis !== undefined && 
          status.durationMillis !== null &&
          typeof status.durationMillis === 'number' && 
          !isNaN(status.durationMillis) &&
          isFinite(status.durationMillis) && 
          status.durationMillis > 0) {
        newDuration = status.durationMillis / 1000;
        console.log(`✅ Valid duration found: ${newDuration.toFixed(2)}s`);
      } else if (status.durationMillis !== undefined) {
        console.warn('❌ Invalid or missing duration received:', {
          value: status.durationMillis,
          type: typeof status.durationMillis,
          isNaN: isNaN(status.durationMillis),
          isFinite: isFinite(status.durationMillis)
        });
      }
      
      // Handle position with comprehensive validation
      let newPosition = 0;
      if (status.positionMillis !== undefined && 
          status.positionMillis !== null &&
          typeof status.positionMillis === 'number' && 
          !isNaN(status.positionMillis) &&
          isFinite(status.positionMillis) && 
          status.positionMillis >= 0) {
        newPosition = status.positionMillis / 1000;
      }
      
      // Only update duration if we have a valid new duration AND either:
      // 1. We don't have a duration yet (duration === 0 or initial state)
      // 2. The new duration is significantly different from current
      if (newDuration !== null && 
          newDuration > 0 && 
          isFinite(newDuration) && 
          !isNaN(newDuration) && 
          (duration === 0 || Math.abs(newDuration - duration) > 0.1)) {
        console.log(`🔄 Duration updated from ${duration.toFixed(2)}s to ${newDuration.toFixed(2)}s`);
        setDuration(newDuration);
      }
      
      setIsPlaying(status.isPlaying);
      
      // Only update position if it's valid and finite
      if (isFinite(newPosition) && !isNaN(newPosition)) {
        setCurrentPosition(newPosition);
      }

      // Auto-hide mini player when audio ends
      if (status.didJustFinish) {
        console.log('🏁 Audio playback finished');
        setIsPlaying(false);
        setCurrentPosition(0);
        setActiveSegmentId(null);
        setShowMiniPlayer(false);
      }
    } else {
      console.log('⏳ Audio not loaded yet, status:', {
        isLoaded: status.isLoaded,
        error: status.error
      });
    }
  };

  const playAudio = async (upload: UploadWithData) => {
    if (!upload || upload.file_type !== 'audio') {
      console.error('Invalid upload for audio playback');
      return;
    }

    setIsLoading(true);

    try {
      // Stop current audio if playing different file
      if (sound && currentUpload?.id !== upload.id) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setCurrentPosition(0);
        setDuration(0); // Reset duration when loading new file
        setActiveSegmentId(null);
      }

      // If same file is already loaded, just play it
      if (sound && currentUpload?.id === upload.id) {
        await sound.playAsync();
        setShowMiniPlayer(true);
        setIsLoading(false);
        return;
      }

      // Load new audio
      setCurrentUpload(upload);
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      console.log(`Loading audio from URL: ${upload.file_url}`);
      
      // Create the sound with enhanced options for better m4a support
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: upload.file_url },
        { 
          shouldPlay: true, 
          isLooping: false,
          // Enhanced options for M4A and other audio formats
          progressUpdateIntervalMillis: 100,
          positionMillis: 0,
          // Request metadata loading
          shouldCorrectPitch: true,
          volume: 1.0,
          isMuted: false,
        },
        onAudioStatusUpdate
      );
      
      setSound(newSound);
      
      // Wait for the audio metadata to load properly with multiple attempts
      let attempts = 0;
      const maxAttempts = 15; // Try for up to 7.5 seconds
      
      const loadMetadata = async () => {
        try {
          const status = await newSound.getStatusAsync();
          console.log(`Metadata loading attempt ${attempts + 1}:`, {
            isLoaded: status.isLoaded,
            durationMillis: (status as any).durationMillis,
            positionMillis: (status as any).positionMillis,
            isPlaying: (status as any).isPlaying
          });
          
          if (status.isLoaded && (status as any).durationMillis) {
            const validDuration = (status as any).durationMillis / 1000;
            if (isFinite(validDuration) && !isNaN(validDuration) && validDuration > 0) {
              console.log(`✅ Audio metadata loaded after ${attempts + 1} attempts - Duration: ${validDuration.toFixed(2)}s`);
              setDuration(validDuration);
              return;
            } else {
              console.warn(`Invalid duration value: ${validDuration} from durationMillis: ${(status as any).durationMillis}`);
            }
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            // Try again with progressive delays for m4a files
            const delay = Math.min(100 + (attempts * 150), 800);
            console.log(`⏳ Retrying metadata load in ${delay}ms... (attempt ${attempts}/${maxAttempts})`);
            setTimeout(loadMetadata, delay);
          } else {
            console.warn('⚠️ Failed to load audio duration after maximum attempts, but audio may still be playable');
            // Don't set duration to 0 - let it remain undefined and handle in UI
            // The onAudioStatusUpdate callback will continue trying to get duration
            console.log('Will continue monitoring for duration updates via status callback');
          }
        } catch (error) {
          console.error('Error getting audio metadata:', error);
          attempts++;
          if (attempts < maxAttempts) {
            const delay = 500;
            setTimeout(loadMetadata, delay);
          } else {
            console.error('Max attempts reached, giving up on explicit metadata loading');
            // Don't set duration to 0 - let status updates handle it
          }
        }
      };
      
      // Start the metadata loading process immediately, then again after a short delay
      loadMetadata();
      setTimeout(loadMetadata, 200);
      
      // Strategy 2: Periodic check for duration during the first 10 seconds of playback
      let periodicCheckCount = 0;
      const maxPeriodicChecks = 20; // Check for 10 seconds (every 500ms)
      
      const periodicDurationCheck = async () => {
        if (periodicCheckCount >= maxPeriodicChecks) {
          console.log('🚫 Stopping periodic duration checks after 10 seconds');
          return;
        }
        
        try {
          const currentStatus = await newSound.getStatusAsync();
          if (currentStatus.isLoaded && (currentStatus as any).durationMillis) {
            const durationSeconds = (currentStatus as any).durationMillis / 1000;
            if (isFinite(durationSeconds) && durationSeconds > 0) {
              console.log(`📊 Periodic check found duration: ${durationSeconds.toFixed(2)}s`);
              setDuration(durationSeconds);
              return; // Stop checking once we have a valid duration
            }
          }
          
          periodicCheckCount++;
          setTimeout(periodicDurationCheck, 500);
        } catch (error) {
          console.error('Error in periodic duration check:', error);
          periodicCheckCount++;
          if (periodicCheckCount < maxPeriodicChecks) {
            setTimeout(periodicDurationCheck, 500);
          }
        }
      };
      
      // Start periodic checking after the first second
      setTimeout(periodicDurationCheck, 1000);
      
      setShowMiniPlayer(true);
      console.log(`Audio loaded and playing: ${upload.file_name}`);
    } catch (error) {
      console.error('Error loading audio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayback = async () => {
    if (!sound) return;

    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        if (isPlaying) {
          await sound.pauseAsync();
        } else {
          await sound.playAsync();
          setShowMiniPlayer(true);
        }
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  };

  const seekToPosition = async (seconds: number) => {
    if (!sound) return;

    try {
      const status = await sound.getStatusAsync();
      if (!status.isLoaded) return;
      
      const maxDuration = status.durationMillis ? status.durationMillis / 1000 : duration;
      const clampedSeconds = Math.max(0, Math.min(seconds, maxDuration));
      
      await sound.setPositionAsync(clampedSeconds * 1000);
      setCurrentPosition(clampedSeconds);
    } catch (error) {
      console.error('Error seeking audio:', error);
    }
  };

  const stopAudio = async () => {
    if (sound) {
      try {
        await sound.stopAsync();
        setIsPlaying(false);
        setCurrentPosition(0);
        setActiveSegmentId(null);
        setShowMiniPlayer(false);
      } catch (error) {
        console.error('Error stopping audio:', error);
      }
    }
  };

  const getTranscriptionData = (): ElevenLabsTranscription | null => {
    if (!currentUpload || !currentUpload.transcriptions || currentUpload.transcriptions.length === 0) {
      return null;
    }
    
    try {
      const transcriptionText = currentUpload.transcriptions[0].transcription_text;
      return JSON.parse(transcriptionText);
    } catch (error) {
      console.error('Error parsing transcription data:', error);
      return null;
    }
  };

  // Helper function to create speaker paragraphs (copied from detail.tsx)
  const createSpeakerParagraphs = (words: TranscriptionWord[]) => {
    const paragraphs: any[] = [];
    let currentParagraph: any = null;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const speakerId = word.speakerId || 'speaker_0';
      
      if (!currentParagraph || currentParagraph.speaker !== speakerId) {
        if (currentParagraph) {
          currentParagraph.segments = createSegmentsFromParagraphWords(currentParagraph.words);
          paragraphs.push(currentParagraph);
        }
        
        currentParagraph = {
          speaker: speakerId,
          text: word.text,
          start: word.start,
          end: word.end,
          words: [word],
          segments: []
        };
      } else {
        currentParagraph.text += word.text;
        currentParagraph.end = word.end;
        currentParagraph.words.push(word);
      }
    }
    
    if (currentParagraph) {
      currentParagraph.segments = createSegmentsFromParagraphWords(currentParagraph.words);
      paragraphs.push(currentParagraph);
    }
    
    return paragraphs;
  };

  const createSegmentsFromParagraphWords = (words: TranscriptionWord[]) => {
    const segments: any[] = [];
    let currentSegment: any = null;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      if (!currentSegment) {
        currentSegment = {
          text: word.text,
          start: word.start,
          end: word.end,
          words: [word]
        };
      } else {
        currentSegment.text += word.text;
        currentSegment.end = word.end;
        currentSegment.words.push(word);
      }
      
      let shouldEndSegment = false;
      
      if (word.type === 'word' && /[.!?]$/.test(word.text.trim())) {
        shouldEndSegment = true;
      }
      
      const nextWordIndex = i + 1;
      if (nextWordIndex < words.length) {
        const nextWord = words[nextWordIndex];
        if (nextWord.type === 'spacing' && (nextWord.end - nextWord.start) > 0.5) {
          shouldEndSegment = true;
        }
      }
      
      if (currentSegment.end - currentSegment.start > 6) {
        shouldEndSegment = true;
      }
      
      if (currentSegment.text.length > 100) {
        if (word.type === 'word' && /[,;:]$/.test(word.text.trim())) {
          shouldEndSegment = true;
        }
      }
      
      if (i === words.length - 1) {
        shouldEndSegment = true;
      }
      
      if (shouldEndSegment && currentSegment) {
        const cleanText = currentSegment.text.trim();
        if (cleanText.length > 0) {
          segments.push({
            text: cleanText,
            start: currentSegment.start,
            end: currentSegment.end,
            words: currentSegment.words
          });
        }
        currentSegment = null;
      }
    }
    
    return segments;
  };

  const contextValue: AudioPlayerContextType = {
    currentUpload,
    sound,
    isPlaying,
    isLoading,
    currentPosition,
    duration,
    activeSegmentId,
    playAudio,
    togglePlayback,
    seekToPosition,
    stopAudio,
    getTranscriptionData,
    showMiniPlayer,
    setShowMiniPlayer,
  };

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
}
