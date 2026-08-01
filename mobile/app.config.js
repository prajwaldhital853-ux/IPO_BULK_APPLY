/** @type {import('expo/config').ExpoConfig} */
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const googleIosScheme = webClientId
  ? `com.googleusercontent.apps.${webClientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`
  : undefined;

module.exports = {
  expo: {
    name: 'NEPSE GHAR',
    slug: 'hello35eg',
    owner: 'hellohello636gs-team',
    scheme: 'nepseghar',
    version: '3.4.15',
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
      versionCode: 60,
      adaptiveIcon: {
        backgroundColor: '#FFFFFF',
        foregroundImage: './assets/nepse-ghar-logo.png',
      },
      predictiveBackGestureEnabled: false,
      // pan: avoid window resize fighting our manual sheet lift.
      // (RN Modal Dialogs ignored layout mode — KeyboardSheetModal avoids Modal on Android.)
      softwareKeyboardLayoutMode: 'pan',
    },
    androidNavigationBar: {
      backgroundColor: '#222826',
      barStyle: 'light-content',
    },
    web: {
      favicon: './assets/nepse-ghar-logo.png',
    },
    plugins: [
      ...(process.env.EAS_BUILD_PROFILE === 'development'
        ? ['expo-dev-client']
        : []),
      [
    'expo-notifications',
    {
      icon: './assets/nepse-ghar-logo.png',
      color: '#1B5E20',
      defaultChannel: 'market',
    },
  ],
  'expo-secure-store',
      [
        'expo-image-picker',
        {
          photosPermission:
            'Allow NEPSE GHAR to access your photos so admin can upload the payment QR code.',
        },
      ],
      [
        'expo-media-library',
        {
          photosPermission:
            'Allow NEPSE GHAR to save the payment QR to your gallery.',
          savePhotosPermission:
            'Allow NEPSE GHAR to save the payment QR to your gallery.',
        },
      ],
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
        projectId: '0a36c499-7902-465c-a03a-75f885ee337e',
      },
    },
  },
};
