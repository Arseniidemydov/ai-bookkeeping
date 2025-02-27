
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lovable.bookkeeping',
  appName: 'ai-bookkeeping',
  webDir: 'dist',
  server: {
    url: 'https://b59393f8-d8a2-4b95-8525-32be3adfd8c9.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
