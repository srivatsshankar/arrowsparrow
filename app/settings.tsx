import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  ArrowLeft, 
  Moon, 
  Sun, 
  Bell, 
  Shield, 
  HelpCircle, 
  FileText, 
  Smartphone,
  Globe,
  Download,
  Trash2
} from 'lucide-react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const { isDarkMode, toggleDarkMode, colors } = useTheme();

  const styles = createStyles(colors);

  const settingsSections = [
    {
      title: 'Appearance',
      items: [
        {
          icon: isDarkMode ? Moon : Sun,
          title: 'Dark Mode',
          description: 'Switch between light and dark themes',
          type: 'toggle',
          value: isDarkMode,
          onToggle: toggleDarkMode,
        },
      ],
    },
    {
      title: 'Notifications',
      items: [
        {
          icon: Bell,
          title: 'Push Notifications',
          description: 'Receive notifications about processing status',
          type: 'toggle',
          value: true,
          onToggle: () => {},
        },
      ],
    },
    {
      title: 'Privacy & Security',
      items: [
        {
          icon: Shield,
          title: 'Privacy Settings',
          description: 'Manage your data and privacy preferences',
          type: 'navigation',
          onPress: () => {},
        },
        {
          icon: Download,
          title: 'Export Data',
          description: 'Download your content and data',
          type: 'navigation',
          onPress: () => {},
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          icon: HelpCircle,
          title: 'Help & Support',
          description: 'Get help and contact support',
          type: 'navigation',
          onPress: () => {},
        },
        {
          icon: FileText,
          title: 'Terms of Service',
          description: 'Read our terms and conditions',
          type: 'navigation',
          onPress: () => {},
        },
        {
          icon: Shield,
          title: 'Privacy Policy',
          description: 'Learn how we protect your data',
          type: 'navigation',
          onPress: () => {},
        },
      ],
    },
    {
      title: 'Advanced',
      items: [
        {
          icon: Smartphone,
          title: 'App Version',
          description: 'Arrow Sparrow v1.0.0',
          type: 'info',
        },
        {
          icon: Globe,
          title: 'Language',
          description: 'English (US)',
          type: 'navigation',
          onPress: () => {},
        },
        {
          icon: Trash2,
          title: 'Clear Cache',
          description: 'Free up storage space',
          type: 'navigation',
          onPress: () => {},
          destructive: true,
        },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.settingItem,
                    itemIndex === section.items.length - 1 && styles.lastItem,
                  ]}
                  onPress={item.onPress}
                  disabled={item.type === 'info' || item.type === 'toggle'}
                  activeOpacity={item.type === 'navigation' ? 0.7 : 1}
                >
                  <View style={styles.settingItemLeft}>
                    <View style={[
                      styles.iconContainer,
                      item.destructive && styles.destructiveIconContainer
                    ]}>
                      <item.icon 
                        size={20} 
                        color={item.destructive ? colors.error : colors.primary} 
                      />
                    </View>
                    <View style={styles.settingItemText}>
                      <Text style={[
                        styles.settingItemTitle,
                        item.destructive && styles.destructiveText
                      ]}>
                        {item.title}
                      </Text>
                      <Text style={styles.settingItemDescription}>
                        {item.description}
                      </Text>
                    </View>
                  </View>
                  
                  {item.type === 'toggle' && (
                    <Switch
                      value={item.value}
                      onValueChange={item.onToggle}
                      trackColor={{ 
                        false: colors.border, 
                        true: colors.primary + '40' 
                      }}
                      thumbColor={item.value ? colors.primary : colors.textSecondary}
                      ios_backgroundColor={colors.border}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made with ❤️ for students everywhere
          </Text>
          <Text style={styles.footerSubtext}>
            Arrow Sparrow helps you learn smarter, not harder
          </Text>
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
      width: 40,
    },
    content: {
      flex: 1,
    },
    section: {
      marginTop: 32,
      marginHorizontal: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 12,
      marginLeft: 4,
    },
    sectionContent: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      minHeight: 72,
    },
    lastItem: {
      borderBottomWidth: 0,
    },
    settingItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    destructiveIconContainer: {
      backgroundColor: colors.error + '15',
    },
    settingItemText: {
      flex: 1,
    },
    settingItemTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    destructiveText: {
      color: colors.error,
    },
    settingItemDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    footer: {
      alignItems: 'center',
      padding: 32,
      marginTop: 24,
    },
    footerText: {
      fontSize: 16,
      color: colors.textSecondary,
      fontWeight: '500',
      textAlign: 'center',
      marginBottom: 4,
    },
    footerSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      opacity: 0.8,
    },
  });
}