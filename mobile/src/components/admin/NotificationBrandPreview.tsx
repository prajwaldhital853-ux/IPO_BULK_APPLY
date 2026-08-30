import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../../theme/colors';
import { rs } from '../../utils/responsive';

const APP_ICON = require('../../assets/nepse-ghar-app-icon.png');

type Props = {
  colors: ThemeColors;
  title: string;
  body: string;
  imageUri?: string | null;
};

/** In-app mock of Android notification — hot-reloads when icon PNG changes in dev. */
export function NotificationBrandPreview({
  colors,
  title,
  body,
  imageUri,
}: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const displayTitle = title.trim() || 'NEPSE GHAR';
  const displayBody =
    body.trim() || 'Market is open · Preview how your notification will look.';

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Notification preview (no APK needed)</Text>
      <Text style={styles.note}>
        Updates live in dev when you change icon PNGs and reload. Real phone
        notifications use the installed APK icon until you rebuild.
      </Text>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Image source={APP_ICON} style={styles.headerIcon} resizeMode="contain" />
          <Text style={styles.appName} numberOfLines={1}>
            NEPSE GHAR
          </Text>
          <Text style={styles.time}>now</Text>
        </View>
        <Text style={styles.notifTitle} numberOfLines={2}>
          {displayTitle}
        </Text>
        <Text style={styles.notifBody} numberOfLines={3}>
          {displayBody}
        </Text>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.richImage} resizeMode="cover" />
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { marginTop: rs(8), marginBottom: rs(4) },
    label: {
      color: c.text,
      fontSize: rs(12),
      fontWeight: '800',
      marginBottom: rs(4),
    },
    note: {
      color: c.textMuted,
      fontSize: rs(10),
      lineHeight: rs(15),
      marginBottom: rs(10),
    },
    card: {
      backgroundColor: '#FFFFFF',
      borderRadius: rs(14),
      padding: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: rs(6),
      gap: rs(8),
    },
    headerIcon: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(6),
    },
    appName: {
      flex: 1,
      color: '#1A1A1A',
      fontSize: rs(12),
      fontWeight: '700',
    },
    time: {
      color: '#888888',
      fontSize: rs(11),
    },
    notifTitle: {
      color: '#111111',
      fontSize: rs(14),
      fontWeight: '800',
      marginBottom: rs(4),
    },
    notifBody: {
      color: '#555555',
      fontSize: rs(12),
      lineHeight: rs(17),
    },
    richImage: {
      width: '100%',
      height: rs(140),
      borderRadius: rs(8),
      marginTop: rs(10),
      backgroundColor: '#F2F2F2',
    },
  });
}
