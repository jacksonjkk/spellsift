import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.spellsift',
  appName: 'SpellSift',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0b0f19',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0b0f19',
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
    },
  },
};

export default config;
