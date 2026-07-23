import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { rs } from '../utils/responsive';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Bottom safe-area inset from useSafeAreaInsets(). */
  bottomInset: number;
  sheetStyle?: StyleProp<ViewStyle>;
  backdropStyle?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  footerStyle?: StyleProp<ViewStyle>;
};

/**
 * Bottom sheet that stays above the Android/iOS keypad inside a Modal.
 * Production APK Modals do not resize with the window — we lift by keyboard
 * screen geometry (more reliable than height alone on Xiaomi / edge-to-edge).
 */
export function KeyboardSheetModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  bottomInset,
  sheetStyle,
  backdropStyle,
  handleStyle,
  titleStyle,
  subtitleStyle,
  footerStyle,
}: Props) {
  const [keyboardLift, setKeyboardLift] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKeyboardLift(0);
      return;
    }

    const apply = (e: {
      endCoordinates: { height: number; screenY: number };
    }) => {
      const screenH = Dimensions.get('screen').height;
      const fromScreen = Math.max(0, screenH - e.endCoordinates.screenY);
      const fromHeight = Math.max(0, e.endCoordinates.height);
      // Prefer the larger value — under-lifting hides Save under the keypad.
      setKeyboardLift(Math.max(fromScreen, fromHeight));
    };

    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const changeEvent =
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';

    const onShow = Keyboard.addListener(showEvent, apply);
    const onChange = Keyboard.addListener(changeEvent, apply);
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardLift(0));

    return () => {
      onShow.remove();
      onChange.remove();
      onHide.remove();
    };
  }, [visible]);

  const keyboardOpen = keyboardLift > 0;
  // Keep a small gap above the keypad; do not subtract inset on Android —
  // subtracting caused Save to sit under the keys on APK devices.
  const gap = keyboardOpen ? rs(10) : 0;
  const padBottom = keyboardOpen
    ? rs(10)
    : Math.max(bottomInset, rs(16));

  const screenH = Dimensions.get('window').height;
  const maxSheetH = Math.max(
    rs(220),
    screenH - (keyboardOpen ? keyboardLift + gap : rs(48)),
  );

  const rootStyle = useMemo(
    () => [
      styles.root,
      { paddingBottom: keyboardOpen ? keyboardLift + gap : 0 },
    ],
    [keyboardOpen, keyboardLift, gap],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={rootStyle} pointerEvents="box-none">
        <Pressable
          style={[styles.backdrop, backdropStyle]}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            sheetStyle,
            { paddingBottom: padBottom, maxHeight: maxSheetH },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            bounces={false}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={[styles.handle, handleStyle]} />
            <Text style={[styles.title, titleStyle]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text>
            ) : null}
            {children}
          </ScrollView>
          {footer ? (
            <View style={[styles.footer, footerStyle]}>{footer}</View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: rs(20),
    borderTopRightRadius: rs(20),
    paddingHorizontal: rs(18),
    paddingTop: rs(10),
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: rs(4),
    flexGrow: 0,
  },
  handle: {
    alignSelf: 'center',
    width: rs(40),
    height: rs(4),
    borderRadius: rs(2),
    marginBottom: rs(14),
  },
  title: {
    fontWeight: '800',
    fontSize: rs(17),
    marginBottom: rs(4),
  },
  subtitle: {
    fontSize: rs(12),
    lineHeight: rs(17),
    marginBottom: rs(12),
  },
  footer: {
    paddingTop: rs(8),
  },
});
