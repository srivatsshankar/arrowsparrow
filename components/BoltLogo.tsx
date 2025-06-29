import React from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface BoltLogoProps {
  style?: any;
}

export default function BoltLogo({ style }: BoltLogoProps) {
  const { colors, colorScheme } = useTheme();

  const handlePress = () => {
    Linking.openURL('https://bolt.new/');
  };

  return (
    <TouchableOpacity 
      style={[styles.container, style]} 
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.logoContainer}>
        {/* Bolt Logo - using the appropriate logo based on theme */}
        <Image
          source={
            colorScheme === 'dark'
              ? require('@/assets/images/bolt-dark.png')
              : require('@/assets/images/bolt-light.png')
          }
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          Built with Bolt
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 32,
    height: 32,
    minWidth: 28,
    minHeight: 28,
  },
  logoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
});
