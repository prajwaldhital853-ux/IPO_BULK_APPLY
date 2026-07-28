import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import {
  DEFAULT_LEGAL_PAGES,
  type LegalDoc,
} from '../content/legalDefaults';
import { fetchPublicAppSettings } from '../services/app/publicSettingsApi';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

function sectionNumber(heading: string): string {
  const m = heading.match(/^(\d+)\./);
  return m ? m[1] : '•';
}

export function LegalScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Legal'>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isPrivacy = route.params?.kind === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms & Conditions';
  const [doc, setDoc] = useState<LegalDoc>(
    isPrivacy ? DEFAULT_LEGAL_PAGES.privacy : DEFAULT_LEGAL_PAGES.terms,
  );

  useEffect(() => {
    void fetchPublicAppSettings().then((s) => {
      setDoc(isPrivacy ? s.legalPages.privacy : s.legalPages.terms);
    });
  }, [isPrivacy]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + rs(48) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introCard}>
          <View
            style={[
              styles.introIcon,
              { backgroundColor: isPrivacy ? '#B2EBF2' : '#C5CAE9' },
            ]}
          >
            <Ionicons
              name={
                isPrivacy ? 'shield-checkmark-outline' : 'document-text-outline'
              }
              size={rs(20)}
              color={isPrivacy ? '#00838F' : '#283593'}
            />
          </View>
          <Text style={styles.intro}>{doc.intro}</Text>
        </View>

        {doc.sections.map((s, index) => (
          <View key={`${s.heading}-${index}`} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.numWell}>
                <Text style={styles.numText}>{sectionNumber(s.heading)}</Text>
              </View>
              <Text style={styles.heading}>
                {s.heading.replace(/^\d+\.\s*/, '')}
              </Text>
            </View>
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
    body: {
      paddingHorizontal: rs(16),
      paddingTop: rs(4),
      gap: rs(12),
    },
    introCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      borderRadius: rs(16),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
      marginBottom: rs(4),
    },
    introIcon: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    intro: {
      flex: 1,
      color: c.textMuted,
      fontSize: rs(13),
      lineHeight: rs(19),
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
      marginBottom: rs(8),
    },
    numWell: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(8),
      backgroundColor: c.primarySoft ?? c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    numText: {
      color: c.accentGreen,
      fontWeight: '800',
      fontSize: rs(13),
    },
    heading: {
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
  });
}
