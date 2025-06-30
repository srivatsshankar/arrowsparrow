import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { RecordingProvider } from '@/contexts/RecordingContext';
import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import GlobalRecordingOverlay from '@/components/GlobalRecordingOverlay';
import MiniAudioPlayer from '@/components/MiniAudioPlayer';

export default function RootLayout() {
  useFrameworkReady();

  return (
    <ThemeProvider>
      <AuthProvider>
        <AudioPlayerProvider>
          <RecordingProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="detail" options={{ headerShown: false }} />
              <Stack.Screen name="profile" options={{ headerShown: false }} />
              <Stack.Screen name="settings" options={{ headerShown: false }} />
              <Stack.Screen name="+not-found" />
            </Stack>
            <GlobalRecordingOverlay />
            <MiniAudioPlayer />
            <StatusBar style="auto" />
          </RecordingProvider>
        </AudioPlayerProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}