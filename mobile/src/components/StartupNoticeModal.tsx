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
  type PopupNoticeItem,
} from '../services/app/publicSettingsApi';
import { rs } from '../utils/responsive';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const NOTICE_MAX_W = Math.min(SCREEN_W - rs(40), rs(400));

type NoticeSlide =
  | { kind: 'image'; url: string }
  | { kind: 'text'; text: string };

/**
 * Shows admin notices on app open (image and/or plain text), one after another.
 * Close via × or by tapping the dimmed area beside the notice.
 */
export function StartupNoticeModal() {
  const [slides, setSlides] = useState<NoticeSlide[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [imgHeight, setImgHeight] = useState(SCREEN_H * 0.55);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await fetchPublicAppSettings();
        const next: NoticeSlide[] = [];
        for (const item of settings.popupNotice.items ?? []) {
          const slide = toSlide(item);
          if (slide) next.push(slide);
        }
        if (!cancelled && next.length) {
          setSlides(next);
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
      if (next >= slides.length) {
        setVisible(false);
        return i;
      }
      return next;
    });
  }, [slides.length]);

  const current = slides[index] ?? null;
  const styles = useMemo(() => makeStyles(), []);

  useEffect(() => {
    setImgHeight(SCREEN_H * 0.55);
  }, [current]);

  if (!current || !visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={advance}
    >
      <View style={styles.backdrop}>
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
              {current.kind === 'image' ? (
                <Image
                  source={{ uri: current.url }}
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
              ) : (
                <View style={styles.textCard}>
                  <Ionicons
                    name="megaphone-outline"
                    size={rs(22)}
                    color="#1B5E20"
                    style={{ marginBottom: rs(10) }}
                  />
                  <Text style={styles.textBody}>{current.text}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function toSlide(item: PopupNoticeItem): NoticeSlide | null {
  if (item.kind === 'text') {
    const text = (item.text ?? '').trim();
    return text ? { kind: 'text', text } : null;
  }
  const url = resolvePublicMediaUrl(item.imageUrl);
  return url ? { kind: 'image', url } : null;
}

function makeStyles() {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.72)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: rs(20),
    },
    noticeWrap: {
      width: NOTICE_MAX_W,
      maxHeight: SCREEN_H * 0.82,
    },
    closeBtn: {
      alignSelf: 'flex-end',
      marginBottom: rs(8),
      width: rs(36),
      height: rs(36),
      borderRadius: rs(18),
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeBody: {
      backgroundColor: '#F7FAF3',
      borderRadius: rs(16),
      overflow: 'hidden',
      maxHeight: SCREEN_H * 0.72,
    },
    scroll: { maxHeight: SCREEN_H * 0.72 },
    scrollContent: { alignItems: 'center', paddingVertical: rs(8) },
    textCard: {
      width: NOTICE_MAX_W,
      paddingHorizontal: rs(18),
      paddingVertical: rs(20),
    },
    textBody: {
      color: '#1B1B1B',
      fontSize: rs(15),
      lineHeight: rs(22),
      fontWeight: '600',
    },
  });
}
