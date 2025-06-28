import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, Mic, FileText, Play, Square } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

export default function UploadScreen() {
  const { user } = useAuth();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);

  const startRecording = async () => {
    try {
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
      const { error: dbError } = await supabase
        .from('uploads')
        .insert({
          user_id: user.id,
          file_name: fileName,
          file_type: fileType,
          file_url: publicUrl,
          file_size: fileSize,
          status: 'uploaded',
        });

      if (dbError) throw dbError;

      Alert.alert('Success', 'File uploaded successfully! Processing will begin shortly.');
      
      // TODO: Trigger processing API
      
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Error', 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Upload Content</Text>
        <Text style={styles.subtitle}>
          Upload audio recordings or documents to get AI-powered summaries and key insights
        </Text>
      </View>

      <View style={styles.uploadOptions}>
        <TouchableOpacity
          style={[styles.uploadCard, isRecording && styles.recordingCard]}
          onPress={isRecording ? stopRecording : startRecording}
        >
          <View style={styles.cardIcon}>
            {isRecording ? (
              <Square size={32} color={isRecording ? '#EF4444' : '#3B82F6'} />
            ) : (
              <Mic size={32} color="#3B82F6" />
            )}
          </View>
          <Text style={styles.cardTitle}>
            {isRecording ? 'Stop Recording' : 'Record Audio'}
          </Text>
          <Text style={styles.cardDescription}>
            {isRecording 
              ? 'Tap to stop and upload recording'
              : 'Record lectures, meetings, or study sessions'
            }
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.uploadCard}
          onPress={pickDocument}
          disabled={uploading}
        >
          <View style={styles.cardIcon}>
            <FileText size={32} color="#3B82F6" />
          </View>
          <Text style={styles.cardTitle}>Upload Document</Text>
          <Text style={styles.cardDescription}>
            Upload PDF or Word documents for text extraction and analysis
          </Text>
        </TouchableOpacity>
      </View>

      {uploading && (
        <View style={styles.uploadingContainer}>
          <Text style={styles.uploadingText}>Uploading file...</Text>
        </View>
      )}

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How it works</Text>
        <View style={styles.infoItem}>
          <Text style={styles.infoNumber}>1</Text>
          <Text style={styles.infoText}>
            Upload your audio recording or document
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoNumber}>2</Text>
          <Text style={styles.infoText}>
            AI processes and extracts text with speaker identification
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoNumber}>3</Text>
          <Text style={styles.infoText}>
            Get intelligent summaries and key study points
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },
  uploadOptions: {
    padding: 24,
    gap: 16,
  },
  uploadCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  recordingCard: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  cardIcon: {
    width: 64,
    height: 64,
    backgroundColor: '#EBF4FF',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  uploadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  uploadingText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  infoSection: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    margin: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoNumber: {
    width: 24,
    height: 24,
    backgroundColor: '#3B82F6',
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
    color: '#6B7280',
    lineHeight: 20,
  },
});