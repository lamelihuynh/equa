import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Equa',
  slug: 'equa',
  scheme: 'equa',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: { bundleIdentifier: 'app.equa.mobile', supportsTablet: true },
  android: { package: 'app.equa.mobile' },
  plugins: ['expo-secure-store'],
  web: { bundler: 'metro' },
};

export default config;
