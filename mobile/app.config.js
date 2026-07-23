/** @type {import('expo/config').ExpoConfig} */
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const googleIosScheme = webClientId
  ? `com.googleusercontent.apps.${webClientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`
  : undefined;

module.exports = {
  expo: {
    name: 'NEPSE GHAR',
    slug: 'nepse',
    owner: 'nepseghars-team',
    scheme: 'nepseghar',
    version: '3.3.8',
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
      versionCode: 43,
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
      'expo-secure-store',
      [
        'expo-image-picker',
        {
          photosPermission:
            'Allow NEPSE GHAR to access your photos so admin can upload the payment QR code.',
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
        projectId: '4973816d-7659-48bb-a817-e1818ea14019',
      },
    },
  },
};
