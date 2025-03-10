
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.bookkeeping.arsenii.demydov',
  appName: 'ai-bookkeeping',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#000000' // Adding black background color to match our app
  }
};

export default config;
