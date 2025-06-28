import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { User, LogOut, Settings, CircleHelp as HelpCircle } from 'lucide-react-native';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  const handleSignOut = () => {
    console.log('Sign out button pressed');
    
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => console.log('Sign out cancelled')
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            console.log('User confirmed sign out');
            try {
              await signOut();
              console.log('Sign out completed successfully');
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Test function to bypass alert
  const handleDirectSignOut = async () => {
    console.log('Direct sign out called');
    try {
      await signOut();
      console.log('Direct sign out completed');
    } catch (error) {
      console.error('Direct sign out error:', error);
    }
  };

  // Simple test function to verify TouchableOpacity works
  const testButton = () => {
    console.log('Test button pressed - TouchableOpacity is working!');
    Alert.alert('Test', 'TouchableOpacity is working correctly!');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.profileSection}>
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <User size={32} color="#3B82F6" />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Welcome!</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
        </View>
      </View>

      <View style={styles.menuSection}>
        <TouchableOpacity style={styles.menuItem}>
          <Settings size={20} color="#6B7280" />
          <Text style={styles.menuItemText}>Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <HelpCircle size={20} color="#6B7280" />
          <Text style={styles.menuItemText}>Help & Support</Text>
        </TouchableOpacity>

        {/* Test button to verify TouchableOpacity works */}
        <TouchableOpacity 
          style={[styles.menuItem, { backgroundColor: '#E0F2FE' }]} 
          onPress={testButton}
          activeOpacity={0.7}
        >
          <Settings size={20} color="#0284C7" />
          <Text style={[styles.menuItemText, { color: '#0284C7' }]}>Test Button (Should Work)</Text>
        </TouchableOpacity>

        {/* Debug button - remove this after testing */}
        <TouchableOpacity 
          style={[styles.menuItem, { backgroundColor: '#FEF2F2' }]} 
          onPress={handleDirectSignOut}
          activeOpacity={0.7}
        >
          <LogOut size={20} color="#F59E0B" />
          <Text style={[styles.menuItemText, { color: '#F59E0B' }]}>Direct Sign Out (Debug)</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem} 
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <LogOut size={20} color="#EF4444" />
          <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Arrow Sparrow v1.0.0</Text>
        <Text style={styles.footerSubtext}>
          AI-powered study assistant
        </Text>
      </View>
    </View>
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
  },
  profileSection: {
    padding: 24,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    backgroundColor: '#EBF4FF',
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
    color: '#111827',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#6B7280',
  },
  menuSection: {
    padding: 24,
    gap: 8,
  },
  menuItem: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 56, // Ensure minimum touch target size
  },
  menuItemText: {
    fontSize: 16,
    color: '#111827',
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
    color: '#9CA3AF',
    fontWeight: '500',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
});