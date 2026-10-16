import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nuo.fit',
  appName: 'NUO Fit',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
