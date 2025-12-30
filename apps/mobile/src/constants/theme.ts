export type ThemeMode = 'light' | 'dark';

export interface Theme {
  colors: {
    bg: string;
    bgSecondary: string;
    sidebarBg: string;
    sidebarText: string;
    activeText: string;
    primary: string;
    primaryHover: string;
    text: string;
    textSecondary: string;
    cardBg: string;
    cardBorder: string;
    glassBg: string;
    glassOverlay: string;
    border: string;
    danger: string;
    success: string;
    warning: string;
    white: string;
    shadowColor: string;
    // For background blobs
    blob1: string;
    blob2: string;
    blob3: string;
  };
  spacing: {
    s: number;
    m: number;
    l: number;
    xl: number;
  };
  roundness: {
    s: number;
    m: number;
    l: number;
    pill: number;
  };
}

// Light theme - 白天模式
export const lightTheme: Theme = {
  colors: {
    bg: '#f0f9ff', // Sky blue background
    bgSecondary: '#e0f2fe',
    sidebarBg: 'rgba(255, 255, 255, 0.3)',
    sidebarText: '#475569',
    activeText: '#0ea5e9',
    primary: '#0ea5e9',
    primaryHover: '#0284c7',
    text: '#1e293b',
    textSecondary: '#64748b',
    cardBg: 'rgba(255, 255, 255, 0.7)', // More transparent for glass effect
    cardBorder: 'rgba(255, 255, 255, 0.6)',
    glassBg: 'transparent',
    glassOverlay: 'rgba(255, 255, 255, 0.3)',
    border: 'rgba(255, 255, 255, 1)',
    danger: '#ef4444',
    success: '#10b981',
    warning: '#f59e0b',
    white: '#ffffff',
    shadowColor: '#0ea5e9',
    // Background blobs
    blob1: '#a78bfa', // Purple
    blob2: '#38bdf8', // Blue
    blob3: '#f472b6', // Pink
  },
  spacing: {
    s: 8,
    m: 16,
    l: 24,
    xl: 32,
  },
  roundness: {
    s: 10,
    m: 16,
    l: 24,
    pill: 50,
  },
};

// Dark theme - 黑夜模式
export const darkTheme: Theme = {
  colors: {
    bg: '#0f172a', // Deep blue-black background
    bgSecondary: '#1e293b',
    sidebarBg: 'rgba(15, 23, 42, 0.5)',
    sidebarText: '#94a3b8',
    activeText: '#38bdf8',
    primary: '#38bdf8',
    primaryHover: '#0ea5e9',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    cardBg: 'rgba(30, 41, 59, 0.6)', // Semi-transparent dark card
    cardBorder: 'rgba(56, 189, 248, 0.3)',
    glassBg: 'transparent',
    glassOverlay: 'rgba(30, 41, 59, 0.5)',
    border: 'rgba(51, 65, 85, 0.8)',
    danger: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
    white: '#ffffff',
    shadowColor: '#38bdf8',
    // Background blobs - darker/cooler tones
    blob1: '#6366f1', // Indigo
    blob2: '#0ea5e9', // Cyan
    blob3: '#8b5cf6', // Purple
  },
  spacing: {
    s: 8,
    m: 16,
    l: 24,
    xl: 32,
  },
  roundness: {
    s: 10,
    m: 16,
    l: 24,
    pill: 50,
  },
};

// Helper to get theme
export const getTheme = (mode: ThemeMode): Theme => {
  return mode === 'dark' ? darkTheme : lightTheme;
};
