import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { Mic, FileText, Headphones, Brain, Zap, Users } from 'lucide-react-native';
import BoltLogo from './BoltLogo';

const { width } = Dimensions.get('window');

export default function FrontPage() {
  const { colors, isDarkMode } = useTheme();
  const router = useRouter();
  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Top Menu Bar */}
        <View style={styles.menuBar}>
          <View style={styles.logoSection}>
            <Image 
              source={isDarkMode 
                ? require('@/assets/app-icon/app-icon-dark.png')
                : require('@/assets/app-icon/app-icon-light.png')
              }
              style={styles.menuIcon}
              resizeMode="contain"
            />
          </View>
          
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.signInButton}
              onPress={() => router.push('/(auth)/signin')}
              activeOpacity={0.8}
            >
              <Text style={styles.signInButtonText}>Sign In</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.getStartedButton}
              onPress={() => router.push('/(auth)/signup')}
              activeOpacity={0.8}
            >
              <Text style={styles.getStartedButtonText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Main Heading */}
          <View style={styles.heroSection}>
            <Text style={styles.appName}>Arrow Sparrow</Text>
            <Text style={styles.appTagline}>Every student's mini-tutor</Text>
            <Text style={styles.heroDescription}>
              Transform your audio and documents into AI-powered summaries and insights
            </Text>
          </View>

          {/* Features */}
          <View style={styles.featuresSection}>
            <View style={styles.featuresGrid}>
              <View style={styles.featureCard}>
                <View style={styles.featureIcon}>
                  <Mic size={24} color={colors.primary} />
                </View>
                <Text style={styles.featureTitle}>Record Audio</Text>
                <Text style={styles.featureDescription}>Capture lectures and meetings</Text>
              </View>
              
              <View style={styles.featureCard}>
                <View style={styles.featureIcon}>
                  <FileText size={24} color={colors.primary} />
                </View>
                <Text style={styles.featureTitle}>Upload Documents</Text>
                <Text style={styles.featureDescription}>Process PDFs and text files</Text>
              </View>
              
              <View style={styles.featureCard}>
                <View style={styles.featureIcon}>
                  <Brain size={24} color={colors.primary} />
                </View>
                <Text style={styles.featureTitle}>AI Summaries</Text>
                <Text style={styles.featureDescription}>Get key insights instantly</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Footer - Pushed to bottom */}
        <View style={styles.footer}>
          <BoltLogo style={styles.boltLogo} />
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      minHeight: '100%',
      justifyContent: 'space-between',
    },
    mainContent: {
      flex: 1,
    },
    footer: {
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    menuBar: {
      paddingTop: 60,
      paddingHorizontal: 24,
      paddingBottom: 20,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    logoSection: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    menuIcon: {
      width: 80,
      height: 80,
    },
    headerButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    signInButton: {
      backgroundColor: colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    signInButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    getStartedButton: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 10,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    getStartedButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    heroSection: {
      paddingHorizontal: 24,
      paddingVertical: 40,
      alignItems: 'center',
    },
    appName: {
      fontSize: 36,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    appTagline: {
      fontSize: 18,
      color: colors.textSecondary,
      fontWeight: '500',
      marginBottom: 16,
      textAlign: 'center',
    },
    heroDescription: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      maxWidth: width * 0.8,
    },
    featuresSection: {
      paddingHorizontal: 24,
      paddingVertical: 20,
    },
    featuresGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
    },
    featureCard: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: 20,
      borderRadius: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    featureIcon: {
      width: 48,
      height: 48,
      backgroundColor: colors.primary + '15',
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    featureTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
      textAlign: 'center',
    },
    featureDescription: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
    },
    boltLogo: {
      marginTop: 20,
      marginBottom: 20,
    },
  });
}
