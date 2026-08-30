/** @type {import('expo/config').ExpoConfig} */
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const googleIosScheme = webClientId
  ? `com.googleusercontent.apps.${webClientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`
  : undefined;

module.exports = {
  expo: {
    name: 'NEPSE GHAR',
    slug: 'hellou',
    owner: 'helloys-team',
    scheme: 'nepseghar',
    version: '3.4.67',
    orientation: 'portrait',
    icon: './assets/nepse-ghar-app-icon.png',
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
      googleServicesFile: './google-services.json',
      versionCode: 113,
      adaptiveIcon: {
        backgroundColor: '#1B5E20',
        foregroundImage: './assets/nepse-ghar-adaptive-foreground.png',
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
      favicon: './assets/nepse-ghar-app-icon.png',
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
      icon: './assets/notification-icon.png',
      color: '#1B5E20',
      defaultChannel: 'market_v2',
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
        projectId: '3845e698-899b-4bce-86da-e2b10ad2d521',
      },
    },
  },
};
