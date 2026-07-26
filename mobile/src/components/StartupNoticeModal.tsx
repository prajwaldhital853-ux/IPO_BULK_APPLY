import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchPublicAppSettings,
  resolvePublicMediaUrl,
} from '../services/app/publicSettingsApi';
import { rs } from '../utils/responsive';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const NOTICE_MAX_W = Math.min(SCREEN_W - rs(40), rs(400));

/**
 * Shows admin-uploaded notice images on app open, one after another.
 * Close via × or by tapping the dimmed area beside the notice.
 * Tall images scroll inside the notice area.
 */
export function StartupNoticeModal() {
  const [urls, setUrls] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [imgHeight, setImgHeight] = useState(SCREEN_H * 0.55);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await fetchPublicAppSettings();
        const resolved = (settings.popupNotice.items ?? [])
          .map((item) => resolvePublicMediaUrl(item.imageUrl))
          .filter((u): u is string => Boolean(u));
        if (!cancelled && resolved.length) {
          setUrls(resolved);
          setIndex(0);
          setVisible(true);
        }
      } catch {
        // Notice is optional.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = useCallback(() => {
    setIndex((i) => {
      const next = i + 1;
      if (next >= urls.length) {
        setVisible(false);
        return i;
      }
      return next;
    });
  }, [urls.length]);

  const currentUrl = urls[index] ?? null;
  const styles = useMemo(() => makeStyles(), []);

  useEffect(() => {
    setImgHeight(SCREEN_H * 0.55);
  }, [currentUrl]);

  if (!currentUrl || !visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={advance}
    >
      <View style={styles.backdrop}>
        {/* Tap outside notice to close / advance */}
        <Pressable style={StyleSheet.absoluteFill} onPress={advance} />

        <View style={styles.noticeWrap} pointerEvents="box-none">
          <Pressable
            style={styles.closeBtn}
            onPress={advance}
            hitSlop={14}
            accessibilityLabel="Close notice"
          >
            <Ionicons name="close" size={rs(22)} color="#fff" />
          </Pressable>

          <View style={styles.noticeBody}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator
              bounces
              nestedScrollEnabled
            >
              <Image
                source={{ uri: currentUrl }}
                style={{ width: NOTICE_MAX_W, height: imgHeight }}
                resizeMode="contain"
                onLoad={(e) => {
                  const src = e.nativeEvent.source;
                  const w = src?.width ?? 0;
                  const h = src?.height ?? 0;
                  if (w > 0 && h > 0) {
                    setImgHeight((NOTICE_MAX_W / w) * h);
                  }
                }}
              />
            </ScrollView>
          </View>

          {urls.length > 1 ? (
            <Text style={styles.counter}>
              {index + 1}/{urls.length}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles() {
  const maxH = SCREEN_H * 0.85;
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.62)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(16),
      paddingVertical: rs(24),
    },
    noticeWrap: {
      width: NOTICE_MAX_W,
      maxHeight: maxH,
      alignItems: 'center',
      zIndex: 2,
    },
    noticeBody: {
      width: NOTICE_MAX_W,
      maxHeight: maxH - rs(48),
      borderRadius: rs(4),
      overflow: 'hidden',
      backgroundColor: 'transparent',
    },
    scroll: {
      width: NOTICE_MAX_W,
      maxHeight: maxH - rs(48),
    },
    scrollContent: {
      alignItems: 'center',
    },
    closeBtn: {
      alignSelf: 'flex-end',
      marginBottom: rs(8),
      width: rs(34),
      height: rs(34),
      borderRadius: rs(17),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    counter: {
      marginTop: rs(10),
      color: 'rgba(255,255,255,0.85)',
      fontSize: rs(12),
      fontWeight: '700',
    },
  });
}
