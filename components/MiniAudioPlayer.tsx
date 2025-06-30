import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { Play, Pause, X } from 'lucide-react-native';

const { width: screenWidth } = Dimensions.get('window');

export default function MiniAudioPlayer() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    currentUpload,
    isPlaying,
    isLoading,
    currentPosition,
    duration,
    togglePlayback,
    stopAudio,
    showMiniPlayer,
    setShowMiniPlayer,
  } = useAudioPlayer();

  const styles = createStyles(colors);

  if (!showMiniPlayer || !currentUpload) {
    return null;
  }

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

  const progress = (duration > 0 && isFinite(duration) && isFinite(currentPosition)) 
    ? Math.max(0, Math.min(1, currentPosition / duration)) 
    : 0;

  const handleTap = () => {
    // Navigate to the detail page of the currently playing audio
    router.push(`/detail?id=${currentUpload.id}`);
  };

  const handlePlayPause = (e: any) => {
    e.stopPropagation(); // Prevent navigation when tapping play/pause
    togglePlayback();
  };

  const handleClose = (e: any) => {
    e.stopPropagation(); // Prevent navigation when tapping close
    stopAudio();
  };

  return (
    <TouchableOpacity
      style={styles.miniPlayerContainer}
      activeOpacity={0.8}
      onPress={handleTap}
    >
      {/* Progress bar at the top */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      {/* Main content */}
      <View style={styles.contentContainer}>
        {/* File info */}
        <View style={styles.fileInfoContainer}>
          <Text style={styles.fileName} numberOfLines={1}>
            {currentUpload.file_name}
          </Text>
          <Text style={styles.timeInfo}>
            {formatTime(currentPosition)} / {duration > 0 ? formatTime(duration) : '--:--'}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity
            style={styles.playButton}
            onPress={handlePlayPause}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : isPlaying ? (
              <Pause size={16} color="#FFFFFF" />
            ) : (
              <Play size={16} color="#FFFFFF" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    miniPlayerContainer: {
      position: 'absolute',
      bottom: 20, // Much closer to the bottom
      left: 16,
      right: 16,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
      overflow: 'hidden',
    },
    progressBarContainer: {
      height: 3,
      backgroundColor: colors.border,
    },
    progressBar: {
      height: '100%',
      backgroundColor: colors.border,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
    },
    contentContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
    },
    fileInfoContainer: {
      flex: 1,
      minWidth: 0, // Allow text to shrink
    },
    fileName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    timeInfo: {
      fontSize: 12,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    controlsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    playButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.border + '40',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
