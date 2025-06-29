import { createContext, useContext, useEffect, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';

interface ThemeContextType {
  isDarkMode: boolean;
  colorScheme: 'light' | 'dark';
  toggleDarkMode: () => void;
  colors: {
    background: string;
    surface: string;
    primary: string;
    text: string;
    textSecondary: string;
    border: string;
    card: string;
    success: string;
    warning: string;
    error: string;
    overlay: string;
  };
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

const lightColors = {
  background: '#F9FAFB',
  surface: '#FFFFFF',
  primary: '#3B82F6',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  card: '#FFFFFF',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

const darkColors = {
  background: '#000000',        // Pure black background
  surface: '#0A0A0A',          // Very dark surface (almost black)
  primary: '#3B82F6',          // Keep primary blue for contrast
  text: '#FFFFFF',             // Pure white text for maximum contrast
  textSecondary: '#A1A1AA',    // Lighter secondary text
  border: '#1A1A1A',           // Very dark borders
  card: '#0A0A0A',             // Very dark cards
  success: '#10B981',          // Keep success green
  warning: '#F59E0B',          // Keep warning orange
  error: '#EF4444',            // Keep error red
  overlay: 'rgba(0, 0, 0, 0.9)', // Darker overlay
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Get initial color scheme
    const initialScheme = Appearance.getColorScheme();
    if (initialScheme) {
      setColorScheme(initialScheme);
    }

    // Listen for system theme changes
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme) {
        setColorScheme(colorScheme);
      }
    });

    return () => subscription?.remove();
  }, []);

  const toggleDarkMode = () => {
    setColorScheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const isDarkMode = colorScheme === 'dark';
  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <ThemeContext.Provider
      value={{
        isDarkMode,
        colorScheme,
        toggleDarkMode,
        colors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}