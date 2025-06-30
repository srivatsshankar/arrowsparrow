import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  TextInput,
  Alert,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { 
  ArrowLeft, 
  Mic, 
  Send,
  Pause,
  Play
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as Speech from 'expo-speech';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';

type KeyPoint = Database['public']['Tables']['key_points']['Row'];
type Upload = Database['public']['Tables']['uploads']['Row'];

interface RecapKeyPoint extends KeyPoint {
  audio_file_url?: string;
  audio_duration?: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const VIVID_BACKGROUNDS = [
  '#FF6B6B', // Vivid Red
  '#4ECDC4', // Vivid Teal
  '#45B7D1', // Vivid Blue
  '#96CEB4', // Vivid Green
  '#FECA57', // Vivid Yellow
  '#FF9FF3', // Vivid Pink
  '#54A0FF', // Vivid Light Blue
  '#5F27CD', // Vivid Purple
  '#00D2D3', // Vivid Cyan
  '#FF9F43', // Vivid Orange
];

export default function RecapScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const { uploadId } = useLocalSearchParams<{ uploadId: string }>();

  // State
  const [upload, setUpload] = useState<Upload | null>(null);
  const [keyPoints, setKeyPoints] = useState<RecapKeyPoint[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isWaitingForNext, setIsWaitingForNext] = useState(false);
  const [autoProgressTimer, setAutoProgressTimer] = useState<number | null>(null);
  const [isChatActive, setIsChatActive] = useState(false);
  
  // Chat state
  const [chatMessage, setChatMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [chatResponse, setChatResponse] = useState('');
  const [isChatResponsePlaying, setIsChatResponsePlaying] = useState(false);
  const [chatResponseSound, setChatResponseSound] = useState<Audio.Sound | null>(null);
  const [isChatInputFocused, setIsChatInputFocused] = useState(false);
  const [pausedBeforeChat, setPausedBeforeChat] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true); // Track if component is still mounted

  const currentBackgroundColor = VIVID_BACKGROUNDS[currentIndex % VIVID_BACKGROUNDS.length];

  const styles = createStyles(colors, currentBackgroundColor);

  // Fetch upload and key points
  useEffect(() => {
    fetchUploadData();
  }, [uploadId]);

  // Handle screen focus/blur for cleanup
  useEffect(() => {
    const cleanup = () => {
      // Cleanup when navigating away
      if (sound) {
        sound.unloadAsync();
        setSound(null);
      }
      if (chatResponseSound) {
        chatResponseSound.unloadAsync();
        setChatResponseSound(null);
      }
      Speech.stop();
      setIsPlaying(false);
      setIsPaused(false);
    };

    return cleanup;
  }, [sound, chatResponseSound]);

  // Cleanup audio on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      console.log('Component unmounting - cleaning up all audio');
      isMountedRef.current = false;
      
      // Stop all audio immediately
      if (sound) {
        sound.unloadAsync().catch(console.error);
      }
      if (chatResponseSound) {
        chatResponseSound.unloadAsync().catch(console.error);
      }
      
      // Clear timer
      if (autoProgressTimer) {
        clearTimeout(autoProgressTimer);
      }
      
      // Stop speech synthesis
      try {
        Speech.stop();
      } catch (error) {
        console.error('Error stopping speech on unmount:', error);
      }
    };
  }, []);

  const fetchUploadData = async () => {
    if (!uploadId || !user) return;

    try {
      // Fetch upload data
      const { data: uploadData, error: uploadError } = await supabase
        .from('uploads')
        .select('*')
        .eq('id', uploadId)
        .single();

      if (uploadError) throw uploadError;
      setUpload(uploadData);

      // Fetch key points
      const { data: keyPointsData, error: keyPointsError } = await supabase
        .from('key_points')
        .select('*')
        .eq('upload_id', uploadId)
        .order('importance_level', { ascending: false });

      if (keyPointsError) throw keyPointsError;
      setKeyPoints(keyPointsData || []);

      if (keyPointsData && keyPointsData.length > 0) {
        // Start with first key point
        await handleKeyPointAudio(keyPointsData[0], 0);
        
        // Preload audio for remaining key points in the background
        preloadRemainingKeyPoints(keyPointsData);
      }
    } catch (error) {
      console.error('Error fetching upload data:', error);
      Alert.alert('Error', 'Failed to load recap data');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPointAudio = async (keyPoint: RecapKeyPoint, index: number, forceRegenerate = false) => {
    try {
      setIsGeneratingAudio(true);
      console.log('Handling audio for key point:', keyPoint.point_text.substring(0, 50) + '...');
      
      // Stop any existing audio first
      await stopAllAudio();
      
      let audioUrl: string | null = null;
      
      // Check if audio file already exists and we're not forcing regeneration
      if (keyPoint.audio_file_url && !forceRegenerate) {
        console.log('Using existing audio URL:', keyPoint.audio_file_url);
        audioUrl = keyPoint.audio_file_url;
      } else {
        console.log('Generating new audio with ElevenLabs...');
        // Try ElevenLabs multiple times before giving up
        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(`ElevenLabs attempt ${attempt}/3`);
          audioUrl = await generateAudioWithElevenLabs(keyPoint.point_text);
          if (audioUrl) {
            console.log(`ElevenLabs successful on attempt ${attempt}`);
            // Save audio URL to database
            await updateKeyPointAudio(keyPoint.id, audioUrl);
            // Update the keyPoints array with the new audio URL
            setKeyPoints(prevKeyPoints => {
              const updatedKeyPoints = [...prevKeyPoints];
              updatedKeyPoints[index] = { ...keyPoint, audio_file_url: audioUrl || undefined };
              return updatedKeyPoints;
            });
            break;
          } else {
            console.log(`ElevenLabs attempt ${attempt} failed`);
            if (attempt < 3) {
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      }
      
      // Play audio
      if (audioUrl) {
        await playAudioFromUrl(audioUrl);
      } else {
        console.log('All ElevenLabs attempts failed, falling back to device TTS');
        // Only use device TTS as absolute last resort
        await playWithDeviceTTS(keyPoint.point_text);
      }
    } catch (error) {
      console.error('Error handling key point audio:', error);
      // Fallback to device TTS only on exception
      console.log('Exception occurred, falling back to device TTS');
      await playWithDeviceTTS(keyPoint.point_text);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const stopAllAudio = async () => {
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch (error) {
        console.error('Error unloading sound:', error);
      }
      setSound(null);
    }
    
    try {
      Speech.stop();
    } catch (error) {
      console.error('Error stopping speech:', error);
    }
    
    setIsPlaying(false);
    setIsPaused(false);
  };

  const generateAudioWithElevenLabs = async (text: string): Promise<string | null> => {
    try {
      console.log('Generating audio with ElevenLabs for text:', text.substring(0, 50) + '...');
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('ElevenLabs request timeout')), 30000)
      );
      
      const requestPromise = supabase.functions.invoke('generate-tts', {
        body: { text }
      });
      
      const response = await Promise.race([requestPromise, timeoutPromise]) as any;

      console.log('ElevenLabs full response:', JSON.stringify(response, null, 2));

      if (response.error) {
        console.error('ElevenLabs error:', response.error);
        return null; // Don't throw, just return null to fallback to TTS
      }
      
      if (response.data && response.data.audioUrl) {
        console.log('Successfully generated audio URL:', response.data.audioUrl);
        // Verify the URL is accessible
        try {
          const testResponse = await fetch(response.data.audioUrl, { method: 'HEAD' });
          if (!testResponse.ok) {
            console.error('Generated audio URL is not accessible:', response.data.audioUrl);
            return null;
          }
        } catch (urlError) {
          console.error('Error testing audio URL:', urlError);
          return null;
        }
        return response.data.audioUrl;
      } else {
        console.error('No audio URL in response. Response data:', response.data);
        return null;
      }
    } catch (error) {
      console.error('Exception in generateAudioWithElevenLabs:', error);
      return null;
    }
  };

  const updateKeyPointAudio = async (keyPointId: string, audioUrl: string) => {
    try {
      const { error } = await supabase
        .from('key_points')
        .update({ 
          audio_file_url: audioUrl,
          audio_duration: 0 // Will be updated when we get actual duration
        })
        .eq('id', keyPointId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating key point audio:', error);
    }
  };

  const playAudioFromUrl = async (url: string) => {
    try {
      // Check if component is still mounted
      if (!isMountedRef.current) {
        console.log('Component unmounted, skipping audio playback');
        return;
      }
      
      console.log('Playing audio from URL:', url);
      
      // Unload previous sound
      if (sound) {
        await sound.unloadAsync();
      }

      // Check again after async operation
      if (!isMountedRef.current) {
        console.log('Component unmounted during sound creation, aborting');
        return;
      }

      const { sound: newSound } = await Audio.Sound.createAsync({ uri: url });
      
      // Final check before setting sound
      if (!isMountedRef.current) {
        console.log('Component unmounted, cleaning up newly created sound');
        await newSound.unloadAsync();
        return;
      }
      
      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish && isMountedRef.current) {
          console.log('Audio finished playing');
          handleAudioFinished();
        }
      });

      await newSound.playAsync();
      setIsPlaying(true);
      console.log('Audio started playing');
    } catch (error) {
      console.error('Error playing audio:', error);
      // Only fallback if component is still mounted
      if (isMountedRef.current) {
        const currentKeyPoint = keyPoints[currentIndex];
        if (currentKeyPoint) {
          playWithDeviceTTS(currentKeyPoint.point_text);
        }
      }
    }
  };

  const playWithDeviceTTS = async (text: string) => {
    try {
      // Check if component is still mounted
      if (!isMountedRef.current) {
        console.log('Component unmounted, skipping TTS playback');
        return;
      }
      
      console.log('Playing with device TTS:', text.substring(0, 50) + '...');
      
      await Speech.speak(text, {
        onDone: () => {
          if (isMountedRef.current) {
            console.log('Device TTS finished');
            handleAudioFinished();
          }
        },
        onStopped: () => {
          if (isMountedRef.current) {
            console.log('Device TTS stopped');
            handleAudioFinished();
          }
        },
        onError: (error) => {
          console.error('Device TTS error:', error);
          if (isMountedRef.current) {
            handleAudioFinished();
          }
        }
      });
      
      if (isMountedRef.current) {
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error with device TTS:', error);
      if (isMountedRef.current) {
        handleAudioFinished();
      }
    }
  };

  const handleAudioFinished = () => {
    // Only proceed if component is still mounted
    if (!isMountedRef.current) {
      console.log('Component unmounted, skipping audio finished handler');
      return;
    }
    
    setIsPlaying(false);
    setIsPaused(false);
    setIsWaitingForNext(true);
    
    // Start auto-progression timer if chat is not active
    if (!isChatActive) {
      startAutoProgressTimer();
    }
  };

  const startAutoProgressTimer = () => {
    // Don't start timer if component is unmounted
    if (!isMountedRef.current) {
      console.log('Component unmounted, skipping timer start');
      return;
    }
    
    // Clear any existing timer
    if (autoProgressTimer) {
      clearTimeout(autoProgressTimer);
    }
    
    console.log('Starting auto-progress timer...');
    
    // Set new timer for 3 seconds
    const timerId = setTimeout(() => {
      console.log('Auto-progress timer fired, isChatActive:', isChatActive, 'isWaitingForNext:', isWaitingForNext);
      if (!isChatActive && isWaitingForNext && isMountedRef.current) {
        moveToNextKeyPoint();
      }
    }, 3000) as unknown as number;
    
    setAutoProgressTimer(timerId);
  };

  const clearAutoProgressTimer = () => {
    if (autoProgressTimer) {
      clearTimeout(autoProgressTimer);
      setAutoProgressTimer(null);
    }
    setIsWaitingForNext(false);
  };

  const moveToNextKeyPoint = () => {
    // Clear auto-progress timer
    clearAutoProgressTimer();
    
    // Stop any current audio
    if (sound) {
      sound.unloadAsync();
      setSound(null);
    }
    Speech.stop();
    
    if (currentIndex < keyPoints.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      
      // Animate background transition
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Wait for animation to start before playing next audio
      setTimeout(() => {
        handleKeyPointAudio(keyPoints[nextIndex], nextIndex);
      }, 150);
    } else {
      // Finished all key points - show completion message or go back
      Alert.alert(
        'Recap Complete', 
        'You\'ve finished all key points!',
        [
          {
            text: 'Review Again',
            onPress: () => {
              setCurrentIndex(0);
              handleKeyPointAudio(keyPoints[0], 0);
            }
          },
          {
            text: 'Done',
            onPress: () => {
              // Clean up and go back
              if (sound) {
                sound.unloadAsync();
                setSound(null);
              }
              if (chatResponseSound) {
                chatResponseSound.unloadAsync();
                setChatResponseSound(null);
              }
              Speech.stop();
              router.back();
            }
          }
        ]
      );
    }
  };

  const moveToPreviousKeyPoint = () => {
    // Clear auto-progress timer
    clearAutoProgressTimer();
    
    // Stop any current audio
    if (sound) {
      sound.unloadAsync();
      setSound(null);
    }
    Speech.stop();
    
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      
      // Animate background transition
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      handleKeyPointAudio(keyPoints[prevIndex], prevIndex);
    }
  };

  // Gesture handling for swipe navigation
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.setValue(event.translationX);
    })
    .onEnd((event) => {
      const threshold = SCREEN_WIDTH * 0.25;
      
      if (event.translationX > threshold && currentIndex > 0) {
        // Swipe right - previous (only if not first item)
        moveToPreviousKeyPoint();
      } else if (event.translationX < -threshold && currentIndex < keyPoints.length - 1) {
        // Swipe left - next (only if not last item)
        moveToNextKeyPoint();
      }
      
      // Reset animation
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    });

  const togglePause = async () => {
    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
        setIsPaused(true);
      } else if (isPaused) {
        await sound.playAsync();
        setIsPlaying(true);
        setIsPaused(false);
      }
    } else if (!isPlaying && !isPaused) {
      // Audio has finished or not started yet, replay current key point
      const currentKeyPoint = keyPoints[currentIndex];
      if (currentKeyPoint) {
        await handleKeyPointAudio(currentKeyPoint, currentIndex);
      }
    } else if (isPlaying) {
      // Using device TTS
      Speech.stop();
      setIsPlaying(false);
      setIsPaused(true);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatMessage.trim() || !keyPoints[currentIndex]) return;

    try {
      setIsChatActive(true);
      clearAutoProgressTimer();
      
      const response = await supabase.functions.invoke('chat-with-keypoint', {
        body: {
          keyPoint: keyPoints[currentIndex].point_text,
          userMessage: chatMessage.trim(),
          uploadId
        }
      });

      if (response.error) throw response.error;

      setChatResponse(response.data.response);
      setChatMessage('');
      
      // Stop chat response audio
      if (chatResponseSound) {
        await chatResponseSound.unloadAsync();
        setChatResponseSound(null);
      }
      
      // Generate and play response with ElevenLabs (with retries)
      console.log('Starting chat response audio generation...');
      let audioUrl = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`Chat response ElevenLabs attempt ${attempt}/3 for text:`, response.data.response.substring(0, 50) + '...');
        audioUrl = await generateAudioWithElevenLabs(response.data.response);
        if (audioUrl) {
          console.log(`Chat response ElevenLabs successful on attempt ${attempt}, URL:`, audioUrl);
          break;
        } else {
          console.log(`Chat response ElevenLabs attempt ${attempt} failed`);
          if (attempt < 3) {
            console.log('Waiting 1 second before retry...');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      if (audioUrl && isMountedRef.current) {
        console.log('Playing chat response audio from URL:', audioUrl);
        try {
          const { sound: newChatSound } = await Audio.Sound.createAsync({ uri: audioUrl });
          
          if (!isMountedRef.current) {
            console.log('Component unmounted, cleaning up chat sound');
            await newChatSound.unloadAsync();
            return;
          }
          
          setChatResponseSound(newChatSound);
          
          newChatSound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
            if (status.isLoaded && status.didJustFinish && isMountedRef.current) {
              console.log('Chat response audio finished');
              setIsChatResponsePlaying(false);
              // Reset chat active state when chat response finishes
              setIsChatActive(false);
              if (!isPlaying && !isPaused) {
                startAutoProgressTimer();
              }
            }
          });

          await newChatSound.playAsync();
          setIsChatResponsePlaying(true);
          console.log('Chat response audio started playing');
        } catch (audioError) {
          console.error('Error playing chat response audio:', audioError);
          // Fall through to TTS fallback
          audioUrl = null;
        }
      }
      
      if (!audioUrl) {
        console.log('All ElevenLabs attempts failed for chat response, falling back to device TTS');
        // Fallback to device TTS only if ElevenLabs fails and component is mounted
        if (isMountedRef.current) {
          try {
            await Speech.speak(response.data.response, {
              onDone: () => {
                console.log('Chat response TTS finished');
                if (isMountedRef.current) {
                  setIsChatResponsePlaying(false);
                  setIsChatActive(false);
                  if (!isPlaying && !isPaused) {
                    startAutoProgressTimer();
                  }
                }
              },
              onStopped: () => {
                console.log('Chat response TTS stopped');
                if (isMountedRef.current) {
                  setIsChatResponsePlaying(false);
                  setIsChatActive(false);
                  if (!isPlaying && !isPaused) {
                    startAutoProgressTimer();
                  }
                }
              },
              onError: (ttsError) => {
                console.error('Chat response TTS error:', ttsError);
                if (isMountedRef.current) {
                  setIsChatResponsePlaying(false);
                  setIsChatActive(false);
                  if (!isPlaying && !isPaused) {
                    startAutoProgressTimer();
                  }
                }
              }
            });
            setIsChatResponsePlaying(true);
            console.log('Chat response TTS started');
          } catch (ttsError) {
            console.error('Failed to start chat response TTS:', ttsError);
            setIsChatResponsePlaying(false);
            setIsChatActive(false);
            if (!isPlaying && !isPaused) {
              startAutoProgressTimer();
            }
          }
        }
      }

    } catch (error) {
      console.error('Error sending chat message:', error);
      Alert.alert('Error', 'Failed to get response');
      setIsChatActive(false);
      if (!isPlaying && !isPaused) {
        startAutoProgressTimer();
      }
    }
  };

  const handleChatFocus = async () => {
    setIsChatInputFocused(true);
    setIsChatActive(true);
    clearAutoProgressTimer(); // Stop auto-progression
    if (isPlaying) {
      setPausedBeforeChat(true);
      await togglePause();
    }
  };

  const handleChatBlur = async () => {
    setIsChatInputFocused(false);
    setIsChatActive(false);
    
    // If audio finished while chatting, restart auto-progression
    if (!isPlaying && !isPaused) {
      startAutoProgressTimer();
    }
    
    if (pausedBeforeChat && !isPlaying) {
      setPausedBeforeChat(false);
      await togglePause();
    }
  };

  const handleVoiceRecording = async () => {
    // Set chat as active when using voice recording
    setIsChatActive(true);
    clearAutoProgressTimer();
    
    // TODO: Implement voice recording with speech-to-text
    // This would use Expo Audio recording and send to speech-to-text service
    Alert.alert('Coming Soon', 'Voice recording feature will be available soon', [
      {
        text: 'OK',
        onPress: () => {
          setIsChatActive(false);
          // Restart auto-progression if audio finished
          if (!isPlaying && !isPaused) {
            startAutoProgressTimer();
          }
        }
      }
    ]);
  };

  const preloadRemainingKeyPoints = async (keyPointsData: RecapKeyPoint[]) => {
    // Skip the first key point since it's already being handled
    for (let i = 1; i < keyPointsData.length; i++) {
      const keyPoint = keyPointsData[i];
      
      // Only preload if audio doesn't already exist
      if (!keyPoint.audio_file_url) {
        try {
          console.log(`Preloading audio for key point ${i + 1}/${keyPointsData.length}:`, keyPoint.point_text.substring(0, 50) + '...');
          
          // Generate audio with ElevenLabs (with retries but don't block UI)
          let audioUrl: string | null = null;
          for (let attempt = 1; attempt <= 2; attempt++) { // Fewer retries for background preloading
            console.log(`Preload ElevenLabs attempt ${attempt}/2 for key point ${i + 1}`);
            audioUrl = await generateAudioWithElevenLabs(keyPoint.point_text);
            if (audioUrl) {
              console.log(`Preload ElevenLabs successful on attempt ${attempt} for key point ${i + 1}`);
              
              // Save audio URL to database
              await updateKeyPointAudio(keyPoint.id, audioUrl);
              
              // Update the keyPoints array with the new audio URL
              setKeyPoints(prevKeyPoints => {
                const updatedKeyPoints = [...prevKeyPoints];
                updatedKeyPoints[i] = { ...keyPoint, audio_file_url: audioUrl || undefined };
                return updatedKeyPoints;
              });
              
              break;
            } else {
              console.log(`Preload ElevenLabs attempt ${attempt} failed for key point ${i + 1}`);
              if (attempt < 2) {
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
          }
          
          if (!audioUrl) {
            console.log(`All preload attempts failed for key point ${i + 1}, will generate on demand`);
          }
          
          // Add a small delay between preload requests to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`Error preloading key point ${i + 1}:`, error);
          // Continue with next key point
        }
      }
    }
    console.log('Finished preloading remaining key points');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.loadingText}>Loading recap...</Text>
      </View>
    );
  }

  if (keyPoints.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <Text style={styles.emptyText}>No key points available for this upload</Text>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => {
            // Clean up audio before navigating back
            if (sound) {
              sound.unloadAsync();
              setSound(null);
            }
            if (chatResponseSound) {
              chatResponseSound.unloadAsync();
              setChatResponseSound(null);
            }
            Speech.stop();
            router.back();
          }}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar hidden />
      
      <Animated.View style={[styles.container, { backgroundColor: currentBackgroundColor }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBackButton}
            onPress={() => {
              // Clean up audio before navigating back
              if (sound) {
                sound.unloadAsync();
                setSound(null);
              }
              if (chatResponseSound) {
                chatResponseSound.unloadAsync();
                setChatResponseSound(null);
              }
              Speech.stop();
              router.back();
            }}
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <Text style={styles.fileName} numberOfLines={1}>
            {upload?.generated_name || upload?.file_name || 'Recap'}
          </Text>
          
          {/* Progress Indicator */}
          <View style={styles.progressContainer}>
            <View style={styles.progressRing}>
              <Text style={styles.progressText}>{currentIndex + 1}/{keyPoints.length}</Text>
            </View>
          </View>
        </View>

        {/* Key Point Content */}
        <GestureDetector gesture={panGesture}>
          <Animated.View 
            style={[
              styles.contentContainer,
              { 
                opacity: fadeAnim,
                transform: [{ translateX }]
              }
            ]}
          >
            <View style={styles.keyPointContainer}>
              {/* Navigation Arrows */}
              <View style={styles.navigationContainer}>
                <TouchableOpacity
                  style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
                  onPress={moveToPreviousKeyPoint}
                  disabled={currentIndex === 0}
                  activeOpacity={0.7}
                >
                  <ArrowLeft size={20} color={currentIndex === 0 ? 'rgba(255,255,255,0.3)' : '#FFFFFF'} />
                </TouchableOpacity>

                <View style={styles.keyPointContent}>
                  <Text style={styles.keyPointText}>
                    {keyPoints[currentIndex]?.point_text}
                  </Text>
                  
                  {/* Play/Pause Button */}
                  <TouchableOpacity
                    style={styles.playPauseButton}
                    onPress={togglePause}
                    activeOpacity={0.7}
                  >
                    {isPlaying ? (
                      <Pause size={24} color="#FFFFFF" />
                    ) : (
                      <Play size={24} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.navButton, currentIndex === keyPoints.length - 1 && styles.navButtonDisabled]}
                  onPress={moveToNextKeyPoint}
                  disabled={currentIndex === keyPoints.length - 1}
                  activeOpacity={0.7}
                >
                  <View style={{ transform: [{ rotate: '180deg' }] }}>
                    <ArrowLeft size={20} color={currentIndex === keyPoints.length - 1 ? 'rgba(255,255,255,0.3)' : '#FFFFFF'} />
                  </View>
                </TouchableOpacity>
              </View>
              
              <View style={styles.keyPointMeta}>
                <Text style={styles.keyPointIndex}>
                  {currentIndex + 1} of {keyPoints.length}
                </Text>
                {isGeneratingAudio && (
                  <Text style={styles.generatingText}>Generating audio...</Text>
                )}
                {autoProgressTimer && !isChatActive && (
                  <Text style={styles.autoProgressText}>Next in 3 seconds...</Text>
                )}
              </View>
            </View>
          </Animated.View>
        </GestureDetector>

        {/* Chat Response */}
        {chatResponse && (
          <View style={styles.chatResponseContainer}>
            <View style={styles.chatResponse}>
              <Text style={styles.chatResponseText}>{chatResponse}</Text>
              <TouchableOpacity
                style={styles.pauseChatButton}
                onPress={() => {
                  if (chatResponseSound) {
                    chatResponseSound.stopAsync();
                  } else {
                    Speech.stop();
                  }
                  setIsChatResponsePlaying(false);
                }}
              >
                {isChatResponsePlaying ? (
                  <Pause size={16} color="#FFFFFF" />
                ) : (
                  <Text style={styles.pauseChatButtonText}>Stopped</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Chat Input - Always visible at bottom */}
        <View style={styles.chatContainer}>
          <View style={styles.chatInputContainer}>
            <TextInput
              style={styles.chatInput}
              value={chatMessage}
              onChangeText={setChatMessage}
              placeholder="Ask about this key point..."
              placeholderTextColor="rgba(255,255,255,0.7)"
              onFocus={handleChatFocus}
              onBlur={handleChatBlur}
            />
            
            <View style={styles.chatActions}>
              <TouchableOpacity
                style={styles.chatActionButton}
                onPress={handleVoiceRecording}
                activeOpacity={0.7}
              >
                <Mic size={20} color="#FFFFFF" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.chatActionButton, styles.sendButton]}
                onPress={handleChatSubmit}
                disabled={!chatMessage.trim()}
                activeOpacity={0.7}
              >
                <Send size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    </GestureHandlerRootView>
  );
}

function createStyles(colors: any, backgroundColor: string) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: {
      fontSize: 18,
      color: colors.text,
      marginTop: 16,
    },
    emptyContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      padding: 32,
    },
    emptyText: {
      fontSize: 18,
      color: colors.text,
      textAlign: 'center',
      marginBottom: 24,
    },
    backButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    backButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Platform.OS === 'ios' ? 50 : 25,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    headerBackButton: {
      padding: 8,
    },
    fileName: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: '#FFFFFF',
      textAlign: 'center',
      marginHorizontal: 16,
    },
    progressContainer: {
      alignItems: 'center',
    },
    progressRing: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 3,
      borderColor: 'rgba(255,255,255,0.3)',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    progressText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#FFFFFF',
      position: 'absolute',
    },
    contentContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    keyPointContainer: {
      alignItems: 'center',
    },
    navigationContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      paddingHorizontal: 20,
    },
    navButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    navButtonDisabled: {
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    keyPointContent: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    keyPointText: {
      fontSize: 24,
      fontWeight: '700',
      color: '#FFFFFF',
      textAlign: 'center',
      lineHeight: 32,
      marginBottom: 24,
    },
    playPauseButton: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
    },
    keyPointMeta: {
      alignItems: 'center',
    },
    keyPointIndex: {
      fontSize: 16,
      color: 'rgba(255,255,255,0.8)',
      marginBottom: 8,
    },
    repeatIndicator: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '600',
    },
    generatingText: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.9)',
      fontStyle: 'italic',
    },
    autoProgressText: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.7)',
      fontStyle: 'italic',
      marginTop: 4,
    },
    chatResponseContainer: {
      position: 'absolute',
      bottom: 120, // Position above the chat input
      left: 20,
      right: 20,
    },
    chatResponse: {
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderRadius: 12,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    chatResponseText: {
      flex: 1,
      fontSize: 16,
      color: '#FFFFFF',
      lineHeight: 22,
    },
    pauseChatButton: {
      marginLeft: 12,
      padding: 4,
    },
    pauseChatButtonText: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.8)',
    },
    chatContainer: {
      position: 'absolute',
      bottom: 40, // Move away from the bottom edge
      left: 20,
      right: 20,
      height: 44, // Match the microphone button height
    },
    chatInputContainer: {
      flexDirection: 'row',
      alignItems: 'center', // Change to center to align with buttons
      height: 44, // Explicit height matching buttons
    },
    chatInput: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: 22, // Match button border radius
      paddingHorizontal: 16,
      paddingVertical: 0, // Remove vertical padding
      fontSize: 16,
      color: '#FFFFFF',
      height: 44, // Exact height match
    },
    chatActions: {
      flexDirection: 'row',
      marginLeft: 12,
    },
    chatActionButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 8,
    },
    sendButton: {
      backgroundColor: 'rgba(255,255,255,0.3)',
    },
  });
}
