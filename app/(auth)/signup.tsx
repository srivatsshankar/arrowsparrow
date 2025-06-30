import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { UserPlus, Mail, Lock, User } from 'lucide-react-native';
import BoltLogo from '@/components/BoltLogo';

export default function SignUp() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const { colors, isDarkMode } = useTheme();

  const handleSignUp = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (fullName.trim().length < 2) {
      Alert.alert('Error', 'Please enter your full name');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, fullName.trim());
      Alert.alert('Success', 'Account created successfully! Please sign in.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.appIcon}>
            <Image 
              source={isDarkMode 
                ? require('@/assets/app-icon/app-icon-dark.png')
                : require('@/assets/app-icon/app-icon-light.png')
              }
              style={styles.appIconImage}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Join Arrow Sparrow to get started</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <User size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor={colors.textSecondary}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Mail size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Lock size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Lock size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor={colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/signin" style={styles.link}>
            <Text style={styles.linkText}>Sign In</Text>
          </Link>
        </View>

        {/* Bolt Logo at bottom */}
        <BoltLogo style={styles.boltLogo} />
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      padding: 24,
      justifyContent: 'center',
    },
    header: {
      alignItems: 'center',
      marginBottom: 48,
    },
    appIcon: {
      width: 80,
      height: 80,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    appIconImage: {
      width: 56,
      height: 56,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    form: {
      marginBottom: 32,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      marginBottom: 16,
      paddingHorizontal: 16,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    inputIcon: {
      marginRight: 12,
    },
    input: {
      flex: 1,
      fontSize: 16,
      paddingVertical: 12,
      color: colors.text,
    },
    button: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    footerText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    link: {
      marginLeft: 4,
    },
    linkText: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: '600',
    },
    boltLogo: {
      marginTop: 40,
    },
  });
}