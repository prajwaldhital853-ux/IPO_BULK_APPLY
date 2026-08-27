/** @type {import('expo/config').ExpoConfig} */
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const googleIosScheme = webClientId
  ? `com.googleusercontent.apps.${webClientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`
  : undefined;

module.exports = {
  expo: {
    name: 'NEPSE GHAR',
    slug: 'ipobulk',
    owner: 'ipobulks-team',
    scheme: 'nepseghar',
    version: '3.4.48',
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
      versionCode: 94,
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
      // Dev client for local USB builds (npm run android:dev). EAS preview/production
      // builds do not set LOCAL_DEV, so those APKs stay normal release-style.
      ...(process.env.LOCAL_DEV === '1' || process.env.EAS_BUILD_PROFILE === 'development'
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
            targetSdkVersion: 35,
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
        projectId: '3766210c-9ef0-485d-b2f7-d28696bb8e25',
      },
    },
  },
};
