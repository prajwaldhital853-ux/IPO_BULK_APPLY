import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from '../components/BrandLogo';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  fetchPublicAppSettings,
  type ContactSettings,
} from '../services/app/publicSettingsApi';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

const FALLBACK: ContactSettings = {
  companyName: 'Kalash Financial Solution Pvt. Ltd.',
  email: 'kalashfinancialsolution@gmail.com',
  whatsapp: '9709133067',
  whatsappUrl: 'https://wa.me/9779709133067',
  facebookUrl: null,
  tiktokUrl: 'https://www.tiktok.com/@unique_share_market',
  socialLinks: [
    {
      id: 'fallback-tiktok',
      platform: 'tiktok',
      label: 'TikTok',
      detail: '@unique_share_market',
      url: 'https://www.tiktok.com/@unique_share_market',
    },
  ],
};

export function AboutCompanyScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [contact, setContact] = useState<ContactSettings>(FALLBACK);

  useEffect(() => {
    void fetchPublicAppSettings().then((s) => {
      if (s?.contact) setContact(s.contact);
    });
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>About Company</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.logoWrap}>
          <BrandLogo variant="full" height={rs(72)} />
        </View>
        <Text style={styles.company}>{contact.companyName}</Text>
        <Text style={styles.tagline}>NEPSE GHAR · Capital market tools</Text>

        <Text style={styles.section}>Who we are</Text>
        <Text style={styles.para}>
          {contact.companyName} builds NEPSE GHAR to help Nepali investors manage
          MeroShare accounts, apply IPO in bulk, track live market data, and
          access research tools — all from one mobile app.
        </Text>

        <Text style={styles.section}>What we offer</Text>
        {[
          'Bulk & single MeroShare IPO apply',
          'Account expiry, portfolio & result checks',
          'Live NEPSE market, watchlist & share news',
          'Premium analytics for serious investors',
        ].map((line) => (
          <Text key={line} style={styles.bullet}>
            • {line}
          </Text>
        ))}

        <Text style={styles.section}>Contact</Text>
        <Pressable
          style={styles.row}
          onPress={() => void Linking.openURL(`mailto:${contact.email}`)}
        >
          <Ionicons name="mail-outline" size={rs(18)} color={colors.teal} />
          <Text style={styles.rowText}>{contact.email}</Text>
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() => void Linking.openURL(contact.whatsappUrl)}
        >
          <Ionicons name="logo-whatsapp" size={rs(18)} color="#25D366" />
          <Text style={styles.rowText}>{contact.whatsapp}</Text>
        </Pressable>
        {(contact.socialLinks ?? []).map((link) =>
          link.url ? (
            <Pressable
              key={link.id}
              style={styles.row}
              onPress={() => void Linking.openURL(link.url)}
            >
              <Ionicons name="link-outline" size={rs(18)} color={colors.teal} />
              <Text style={styles.rowText}>
                {link.label}
                {link.detail ? ` · ${link.detail}` : ''}
              </Text>
            </Pressable>
          ) : null,
        )}
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
    logoWrap: {
      alignSelf: 'center',
      backgroundColor: '#fff',
      borderRadius: rs(16),
      padding: rs(14),
      marginBottom: rs(14),
    },
    company: {
      color: c.text,
      fontSize: rs(18),
      fontWeight: '800',
      textAlign: 'center',
    },
    tagline: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(4),
      marginBottom: rs(20),
      fontSize: rs(12),
    },
    section: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      marginTop: rs(14),
      marginBottom: rs(8),
    },
    para: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(20),
    },
    bullet: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(22),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      paddingVertical: rs(10),
    },
    rowText: { color: c.text, fontSize: rs(13), fontWeight: '600' },
  });
}
