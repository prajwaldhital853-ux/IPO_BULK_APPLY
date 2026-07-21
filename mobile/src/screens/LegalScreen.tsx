import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

type Section = { heading: string; body: string };

const TERMS: Section[] = [
  {
    heading: '1. Acceptance of Terms',
    body: 'By downloading, installing or using NEPSE GHAR you agree to these Terms & Conditions. If you do not agree, please stop using the app.',
  },
  {
    heading: '2. What the app does',
    body: 'NEPSE GHAR is a tool that helps you manage your MeroShare accounts, apply for IPO/FPO/rights in bulk, check application status and results, and view NEPSE market data. We are an independent tool and are not affiliated with, endorsed by, or operated by CDSC, MeroShare, or NEPSE.',
  },
  {
    heading: '3. Your accounts & responsibility',
    body: 'You are responsible for the MeroShare credentials (DP, username, password, CRN, transaction PIN) you add to the app and for every action performed using them, including IPO applications. Always verify company, quantity and amount before you confirm any application.',
  },
  {
    heading: '4. No financial advice',
    body: 'Market data, analytics and premium insights are provided for information only and are not investment advice. You are solely responsible for your investment decisions. Data may be delayed or inaccurate.',
  },
  {
    heading: '5. Subscriptions',
    body: 'Some features require a paid premium subscription. Prices and account limits are shown in the app. Premium is activated after your payment is verified. Fees are non-refundable except where required by law.',
  },
  {
    heading: '6. Acceptable use',
    body: 'You agree not to misuse the app, attempt to access other users’ data, reverse-engineer the app, or use it for any unlawful purpose.',
  },
  {
    heading: '7. Availability & liability',
    body: 'The app depends on third-party services (MeroShare/CDSC, NEPSE and our servers) that may be unavailable at times. We are not liable for missed IPO applications, allotment outcomes, losses, or downtime arising from such services or from your use of the app.',
  },
  {
    heading: '8. Changes',
    body: 'We may update these terms and app features from time to time. Continued use after changes means you accept the updated terms.',
  },
];

const PRIVACY: Section[] = [
  {
    heading: '1. Information we handle',
    body: 'To provide its features the app handles your MeroShare account details (DP, username, password, CRN, transaction PIN), your profile info (name, email) when you sign in, and app usage needed to operate features.',
  },
  {
    heading: '2. Where your credentials are stored',
    body: 'Your MeroShare passwords, CRN and transaction PIN are stored encrypted on your own device using the secure storage of your phone. They are used only to log in to MeroShare on your behalf to perform the actions you request.',
  },
  {
    heading: '3. How we use data',
    body: 'We use your data only to run the features you use — logging into MeroShare, applying for IPOs, checking status/results, showing market data, and managing your subscription. We do not sell your data.',
  },
  {
    heading: '4. Account & payment',
    body: 'When you sign in with Google we receive your basic profile (name, email, avatar) to create your account. Premium payment screenshots you share for verification are used only to activate your subscription.',
  },
  {
    heading: '5. Third-party services',
    body: 'The app communicates with MeroShare/CDSC and NEPSE data sources to fetch and submit information you request, and with our servers for authentication and subscription. Their handling of data is governed by their own policies.',
  },
  {
    heading: '6. Data retention & deletion',
    body: 'Account credentials remain on your device until you remove the account or uninstall the app. You can delete your profile at any time from Profile → Delete account, which removes your server profile and local data.',
  },
  {
    heading: '7. Security',
    body: 'We use device secure storage and encrypted connections. However, no method is 100% secure. Keep your device protected with a screen lock and the in-app PIN.',
  },
  {
    heading: '8. Contact',
    body: 'For any privacy question, contact us from Profile → Connect With Us (email or WhatsApp).',
  },
];

export function LegalScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Legal'>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isPrivacy = route.params?.kind === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms & Conditions';
  const sections = isPrivacy ? PRIVACY : TERMS;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.intro}>
          {isPrivacy
            ? 'This Privacy Policy explains how NEPSE GHAR handles your information.'
            : 'Please read these terms carefully before using NEPSE GHAR.'}
        </Text>
        {sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            <Text style={styles.para}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
    },
    body: { padding: rs(20), paddingBottom: rs(40) },
    intro: {
      color: c.textMuted,
      fontSize: rs(12),
      lineHeight: rs(18),
      marginBottom: rs(16),
    },
    section: { marginBottom: rs(16) },
    heading: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      marginBottom: rs(6),
    },
    para: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(20),
    },
  });
}
