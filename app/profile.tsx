import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { User, LogOut, Settings, CircleHelp as HelpCircle, ArrowLeft } from 'lucide-react-native';
import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import BoltLogo from '@/components/BoltLogo';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [userProfile, setUserProfile] = useState<{ full_name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const styles = createStyles(colors);

  // Fetch user profile data
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          // Fallback to user metadata if profile doesn't exist
          const fullName = user.user_metadata?.full_name || user.user_metadata?.fullName;
          if (fullName) {
            setUserProfile({ full_name: fullName });
          }
        } else {
          setUserProfile(data);
        }
      } catch (error) {
        console.error('Profile fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  // Stable signOut handler for Alert
  const handleSignOutConfirmed = useCallback(async () => {
    setShowSignOutModal(false);
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }, [signOut]);

  const confirmAndSignOut = () => {
    setShowSignOutModal(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.profileSection}>
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <User size={32} color={colors.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {loading ? 'Loading...' : userProfile?.full_name || 'Welcome!'}
            </Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
        </View>
      </View>

      <View style={styles.menuSection}>
        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push('/settings')}
          activeOpacity={0.7}
        >
          <Settings size={20} color={colors.textSecondary} />
          <Text style={styles.menuItemText}>Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <HelpCircle size={20} color={colors.textSecondary} />
          <Text style={styles.menuItemText}>Help & Support</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem} 
          onPress={confirmAndSignOut}
          activeOpacity={0.7}
        >
          <LogOut size={20} color={colors.error} />
          <Text style={[styles.menuItemText, { color: colors.error }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Arrow Sparrow v1.0.0</Text>
        <Text style={styles.footerSubtext}>
          AI-powered study assistant
        </Text>
      </View>

      {/* Custom Sign Out Confirmation Modal */}
      <Modal
        visible={showSignOutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSignOutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Sign Out</Text>
            <Text style={styles.modalMessage}>Are you sure you want to sign out?</Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowSignOutModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleSignOutConfirmed}
              >
                <Text style={styles.confirmButtonText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bolt Logo at bottom */}
      <BoltLogo style={styles.boltLogo} />
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 24,
      paddingTop: 60,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    placeholder: {
      width: 40, // Same width as back button to center the title
    },
    profileSection: {
      padding: 24,
    },
    profileCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
    },
    avatarContainer: {
      width: 64,
      height: 64,
      backgroundColor: colors.primary + '15',
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    profileEmail: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    menuSection: {
      padding: 24,
      gap: 8,
    },
    menuItem: {
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 56, // Ensure minimum touch target size
    },
    menuItemText: {
      fontSize: 16,
      color: colors.text,
      marginLeft: 12,
      flex: 1, // Prevent text from interfering with touch
    },
    footer: {
      alignItems: 'center',
      padding: 24,
      marginTop: 'auto',
    },
    footerText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    footerSubtext: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContainer: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      marginHorizontal: 24,
      minWidth: 280,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 8,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    modalMessage: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    modalButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.border + '40',
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmButton: {
      backgroundColor: colors.error,
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    confirmButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    boltLogo: {
      position: 'absolute',
      bottom: 20,
      left: 0,
      right: 0,
    },
  });
}