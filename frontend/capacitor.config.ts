import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.receipttaker.app',
  appName: 'Receipt Taker',
  webDir: 'dist',
  server: {
    // For development, you can point to your local dev server:
    // url: 'http://192.168.x.x:5173',
    // cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    Camera: {
      // iOS camera permissions
      permissionType: 'prompt',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0f1a',
      showSpinner: true,
      spinnerColor: '#10b981',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0f1a',
    },
  },
};

export default config;
