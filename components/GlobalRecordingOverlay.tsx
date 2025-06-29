import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useRecording } from '@/contexts/RecordingContext';
import { Mic, Play, Pause, Square, X, ArrowLeft } from 'lucide-react-native';
import Svg, { Rect } from 'react-native-svg';

const AudioWaveform = ({ levels, width = 300, height = 100, isPaused = false }: { 
  levels: number[], 
  width?: number, 
  height?: number,
  isPaused?: boolean 
}) => {
  const { colors } = useTheme();
  const barWidth = 3;
  const barSpacing = 1;
  const maxBars = Math.floor(width / (barWidth + barSpacing));
  const displayLevels = levels.slice(-maxBars);

  const waveformContainerStyle = {
    width,
    height,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  };

  return (
    <View style={waveformContainerStyle}>
      <Svg width={width} height={height}>
        {displayLevels.map((level, index) => {
          const barHeight = Math.max(level * height * 0.8, 4); // Minimum height of 4
          const x = index * (barWidth + barSpacing);
          const y = (height - barHeight) / 2;
          
          return (
            <Rect
              key={index}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={isPaused ? colors.textSecondary : colors.primary}
              opacity={isPaused ? 0.5 : 1}
              rx={1.5}
            />
          );
        })}
      </Svg>
    </View>
  );
};

export default function GlobalRecordingOverlay() {
  const { colors } = useTheme();
  const {
    showRecordingScreen,
    recordingDuration,
    isPaused,
    audioLevels,
    pauseRecording,
    stopRecording,
    cancelRecording,
    minimizeRecording,
  } = useRecording();

  const styles = createStyles(colors);

  const formatDuration = (milliseconds: number) => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Recording Screen Modal - Global across all screens */}
      <Modal
        visible={showRecordingScreen}
        transparent={false}
        animationType="slide"
        onRequestClose={minimizeRecording}
      >
        <View style={styles.recordingScreen}>
          <View style={styles.recordingHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={minimizeRecording}
              activeOpacity={0.7}
            >
              <ArrowLeft size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.recordingTitle}>Recording</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.recordingContent}>
            {/* Recording Status */}
            <View style={styles.recordingStatusContainer}>
              <View style={[styles.recordingIndicator, { backgroundColor: isPaused ? colors.warning : colors.error }]} />
              <Text style={styles.recordingStatus}>
                {isPaused ? 'PAUSED' : 'RECORDING'}
              </Text>
            </View>

            {/* Timer */}
            <Text style={styles.recordingTimer}>{formatDuration(recordingDuration)}</Text>
            
            {/* Max Duration Warning */}
            {recordingDuration > (4 * 60 * 60 * 1000) * 0.9 && (
              <Text style={styles.warningText}>
                Approaching 4-hour limit ({formatDuration((4 * 60 * 60 * 1000) - recordingDuration)} remaining)
              </Text>
            )}

            {/* Audio Waveform */}
            <View style={styles.waveformSection}>
              <AudioWaveform 
                levels={audioLevels} 
                width={Dimensions.get('window').width - 48} 
                height={120}
                isPaused={isPaused}
              />
            </View>

            {/* Recording Controls */}
            <View style={styles.recordingControls}>
              <TouchableOpacity
                style={[styles.controlButton, styles.pauseButton]}
                onPress={pauseRecording}
                activeOpacity={0.8}
              >
                {isPaused ? (
                  <Play size={28} color="#FFFFFF" />
                ) : (
                  <Pause size={28} color="#FFFFFF" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlButton, styles.stopButton]}
                onPress={stopRecording}
                activeOpacity={0.8}
              >
                <Square size={24} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlButton, styles.cancelControlButton]}
                onPress={cancelRecording}
                activeOpacity={0.8}
              >
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.recordingHint}>
              {isPaused ? 'Tap play to resume recording' : 'Recording will automatically stop after 4 hours'}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    // Recording screen styles
    recordingScreen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    recordingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    recordingTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    headerSpacer: {
      width: 40, // Same as back button to center title
    },
    recordingContent: {
      flex: 1,
      paddingHorizontal: 24,
      paddingVertical: 32,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    recordingStatusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    recordingIndicator: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    recordingStatus: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: 1,
    },
    recordingTimer: {
      fontSize: 48,
      fontWeight: '300',
      color: colors.text,
      fontVariant: ['tabular-nums'],
      marginBottom: 8,
    },
    warningText: {
      fontSize: 14,
      color: colors.warning,
      textAlign: 'center',
      marginBottom: 32,
    },
    waveformSection: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      marginVertical: 40,
    },
    waveformContainer: {
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
    },
    recordingControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 24,
      marginTop: 40,
    },
    controlButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    pauseButton: {
      backgroundColor: colors.primary,
    },
    stopButton: {
      backgroundColor: colors.error,
    },
    cancelControlButton: {
      backgroundColor: colors.warning,
    },
    recordingHint: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 24,
      lineHeight: 20,
    },
  });
}
