import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchPublicAppSettings,
  resolvePublicMediaUrl,
} from '../services/app/publicSettingsApi';
import { rs } from '../utils/responsive';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * Shows an admin-uploaded notice image when the app opens.
 * Closed with the X button for the rest of this session.
 */
export function StartupNoticeModal() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await fetchPublicAppSettings();
        const url = resolvePublicMediaUrl(settings.popupNotice.imageUrl);
        if (!cancelled && url) {
          setImageUrl(url);
          setVisible(true);
        }
      } catch {
        // Ignore — notice is optional.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const styles = useMemo(() => makeStyles(), []);

  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable
            style={styles.closeBtn}
            onPress={() => setVisible(false)}
            hitSlop={12}
            accessibilityLabel="Close notice"
          >
            <Ionicons name="close" size={rs(22)} color="#666" />
          </Pressable>
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>
      </View>
    </Modal>
  );
}

function makeStyles() {
  const maxW = Math.min(SCREEN_W - rs(32), rs(420));
  const maxH = SCREEN_H * 0.78;
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(16),
    },
    card: {
      width: maxW,
      maxHeight: maxH,
      backgroundColor: '#fff',
      borderRadius: rs(8),
      overflow: 'hidden',
      paddingTop: rs(36),
      paddingBottom: rs(10),
      paddingHorizontal: rs(10),
    },
    closeBtn: {
      position: 'absolute',
      top: rs(6),
      right: rs(6),
      zIndex: 2,
      width: rs(32),
      height: rs(32),
      borderRadius: rs(16),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.06)',
    },
    image: {
      width: '100%',
      height: maxH - rs(50),
      backgroundColor: '#fff',
    },
  });
}
