/** @type {import('expo/config').ExpoConfig} */
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const googleIosScheme = webClientId
  ? `com.googleusercontent.apps.${webClientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`
  : undefined;

module.exports = {
  expo: {
    name: 'NEPSE GHAR',
    slug: 'nepse-ghar',
    owner: 'bulkipo',
    scheme: 'nepseghar',
    version: '3.2.2',
    orientation: 'portrait',
    icon: './assets/nepse-ghar-logo.png',
    userInterfaceStyle: 'dark',
    splash: {
      image: './assets/nepse-ghar-logo.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.nepse.ghar',
    },
    android: {
      package: 'com.nepse.ghar',
      versionCode: 24,
      adaptiveIcon: {
        backgroundColor: '#FFFFFF',
        foregroundImage: './assets/nepse-ghar-logo.png',
      },
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: 'resize',
    },
    androidNavigationBar: {
      backgroundColor: '#1A1A1A',
      barStyle: 'light-content',
    },
    web: {
      favicon: './assets/nepse-ghar-logo.png',
    },
    plugins: [
      ...(process.env.EAS_BUILD_PROFILE === 'development'
        ? ['expo-dev-client']
        : []),
      'expo-secure-store',
      [
        'expo-screen-orientation',
        {
          initialOrientation: 'PORTRAIT',
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 24,
            targetSdkVersion: 34,
            useLegacyPackaging: true,
          },
        },
      ],
      ...(googleIosScheme
        ? [
            [
              '@react-native-google-signin/google-signin',
              { iosUrlScheme: googleIosScheme },
            ],
          ]
        : []),
    ],
    extra: {
      eas: {
        projectId: '304bed42-af96-4448-8060-23b24d67af01',
      },
    },
  },
};
