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
import { DEFAULT_LEGAL_PAGES, type AboutPage } from '../content/legalDefaults';
import type { ThemeColors } from '../theme/colors';
import {
  fetchPublicAppSettings,
  type ContactSettings,
} from '../services/app/publicSettingsApi';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

const FALLBACK_CONTACT: ContactSettings = {
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
  const [contact, setContact] = useState<ContactSettings>(FALLBACK_CONTACT);
  const [about, setAbout] = useState<AboutPage>(DEFAULT_LEGAL_PAGES.about);

  useEffect(() => {
    void fetchPublicAppSettings().then((s) => {
      if (s?.contact) setContact(s.contact);
      if (s?.legalPages?.about) setAbout(s.legalPages.about);
    });
  }, []);

  const whoText = about.whoWeAre.includes('Kalash Financial Solution')
    ? about.whoWeAre.replace(
        /Kalash Financial Solution Pvt\. Ltd\./g,
        contact.companyName || 'Kalash Financial Solution Pvt. Ltd.',
      )
    : about.whoWeAre;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>About Company</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + rs(48) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandCard}>
          <View style={styles.logoWrap}>
            <BrandLogo variant="full" height={rs(64)} />
          </View>
          <Text style={styles.company}>{contact.companyName}</Text>
          <Text style={styles.tagline}>{about.tagline}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.iconWell, { backgroundColor: '#B2DFDB' }]}>
              <Ionicons name="business-outline" size={rs(18)} color="#00695C" />
            </View>
            <Text style={styles.section}>Who we are</Text>
          </View>
          <Text style={styles.para}>{whoText}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.iconWell, { backgroundColor: '#C8E6C9' }]}>
              <Ionicons name="sparkles-outline" size={rs(18)} color="#2E7D32" />
            </View>
            <Text style={styles.section}>What we offer</Text>
          </View>
          {about.offerings.map((line) => (
            <View key={line} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bullet}>{line}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.groupLabel}>Contact</Text>
        <Pressable
          style={styles.contactCard}
          onPress={() => void Linking.openURL(`mailto:${contact.email}`)}
        >
          <View style={[styles.iconWell, { backgroundColor: '#FFCDD2' }]}>
            <Ionicons name="mail-outline" size={rs(18)} color="#C62828" />
          </View>
          <View style={styles.contactText}>
            <Text style={styles.contactLabel}>Email</Text>
            <Text style={styles.contactDetail} numberOfLines={1}>
              {contact.email}
            </Text>
          </View>
          <Ionicons name="open-outline" size={rs(16)} color={colors.textDim} />
        </Pressable>

        <Pressable
          style={styles.contactCard}
          onPress={() => void Linking.openURL(contact.whatsappUrl)}
        >
          <View style={[styles.iconWell, { backgroundColor: '#C8E6C9' }]}>
            <Ionicons name="logo-whatsapp" size={rs(18)} color="#25D366" />
          </View>
          <View style={styles.contactText}>
            <Text style={styles.contactLabel}>WhatsApp</Text>
            <Text style={styles.contactDetail}>{contact.whatsapp}</Text>
          </View>
          <Ionicons name="open-outline" size={rs(16)} color={colors.textDim} />
        </Pressable>

        {(contact.socialLinks ?? []).map((link) =>
          link.url ? (
            <Pressable
              key={link.id}
              style={styles.contactCard}
              onPress={() => void Linking.openURL(link.url)}
            >
              <View style={[styles.iconWell, { backgroundColor: '#CFD8DC' }]}>
                <Ionicons name="link-outline" size={rs(18)} color={colors.teal} />
              </View>
              <View style={styles.contactText}>
                <Text style={styles.contactLabel}>{link.label}</Text>
                <Text style={styles.contactDetail} numberOfLines={1}>
                  {link.detail || link.url}
                </Text>
              </View>
              <Ionicons name="open-outline" size={rs(16)} color={colors.textDim} />
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
    body: {
      paddingHorizontal: rs(16),
      paddingTop: rs(4),
      gap: rs(12),
    },
    brandCard: {
      borderRadius: rs(18),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      paddingHorizontal: rs(16),
      paddingVertical: rs(20),
      alignItems: 'center',
      marginBottom: rs(4),
    },
    logoWrap: {
      backgroundColor: '#fff',
      borderRadius: rs(16),
      padding: rs(12),
      marginBottom: rs(12),
    },
    company: {
      color: c.text,
      fontSize: rs(17),
      fontWeight: '800',
      textAlign: 'center',
    },
    tagline: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(4),
      fontSize: rs(12),
      fontWeight: '600',
    },
    card: {
      borderRadius: rs(16),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginBottom: rs(10),
    },
    iconWell: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(10),
      alignItems: 'center',
      justifyContent: 'center',
    },
    section: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
    },
    para: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(20),
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(10),
      marginBottom: rs(8),
    },
    bulletDot: {
      width: rs(7),
      height: rs(7),
      borderRadius: rs(4),
      backgroundColor: c.accentGreen,
      marginTop: rs(6),
    },
    bullet: {
      flex: 1,
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(20),
      fontWeight: '600',
    },
    groupLabel: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '800',
      letterSpacing: 0.4,
      marginTop: rs(4),
      marginBottom: rs(-2),
    },
    contactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      borderRadius: rs(16),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
    },
    contactText: { flex: 1 },
    contactLabel: {
      color: c.text,
      fontSize: rs(14),
      fontWeight: '700',
    },
    contactDetail: {
      color: c.textMuted,
      fontSize: rs(12),
      marginTop: rs(2),
      fontWeight: '600',
    },
  });
}
