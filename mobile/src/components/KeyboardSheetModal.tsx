import React, { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
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
  scrollContentStyle?: StyleProp<ViewStyle>;
  showsVerticalScrollIndicator?: boolean;
};

function keyboardOcclusion(e: {
  endCoordinates: { height: number; screenY: number };
}): number {
  const screenH = Dimensions.get('screen').height;
  const fromScreen = Math.max(0, screenH - e.endCoordinates.screenY);
  const fromHeight = Math.max(0, e.endCoordinates.height);
  // Prefer the larger value — under-lifting hides Save under the keypad.
  return Math.max(fromScreen, fromHeight);
}

/**
 * Bottom sheet with a pinned footer above the keypad.
 *
 * Uses a Modal on all platforms so the sheet renders reliably on Expo SDK 57+.
 * Keyboard lift uses Keyboard metrics + marginBottom so Save stays above the keys.
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
  scrollContentStyle,
  showsVerticalScrollIndicator = false,
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
      setKeyboardLift(keyboardOcclusion(e));
    };

    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, apply);
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardLift(0));
    const onChange =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillChangeFrame', apply)
        : Keyboard.addListener('keyboardDidChangeFrame', apply);

    // Catch already-open keypad (focus raced ahead of listener attach).
    const metrics = Keyboard.metrics();
    if (metrics?.height) {
      setKeyboardLift(
        keyboardOcclusion({
          endCoordinates: {
            height: metrics.height,
            screenY: metrics.screenY,
          },
        }),
      );
    }

    return () => {
      onShow.remove();
      onHide.remove();
      onChange.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const keyboardOpen = keyboardLift > 0;
  // MIUI / gesture nav often under-reports height — keep a clear gap above keys.
  const gap = keyboardOpen
    ? Platform.OS === 'android'
      ? rs(20)
      : rs(10)
    : 0;
  const padBottom = keyboardOpen
    ? rs(10)
    : Math.max(bottomInset, rs(16));

  const screenH = Dimensions.get('window').height;
  const maxSheetH = Math.max(
    rs(220),
    screenH - (keyboardOpen ? keyboardLift + gap : rs(48)),
  );

  const sheetLift = keyboardOpen ? keyboardLift + gap : 0;

  const rootStyle = useMemo(
    () => [
      styles.root,
      // Push the whole sheet above the keypad (works in-screen; Modal Dialog did not).
      { marginBottom: sheetLift },
    ],
    [sheetLift],
  );

  const sheetBody = (
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
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          nestedScrollEnabled
          bounces
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, scrollContentStyle]}
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
  );

  if (!visible) return null;

  // Modal on all platforms — SDK 57+ Android absoluteFill overlays often render
  // as a blank sheet (only the drag handle visible). Keyboard lift still uses
  // Keyboard metrics + marginBottom above the keypad.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {sheetBody}
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
    minHeight: rs(200),
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: rs(8),
    flexGrow: 1,
  },
  handle: {
    alignSelf: 'center',
    width: rs(40),
    height: rs(4),
    borderRadius: rs(2),
    marginBottom: rs(14),
    backgroundColor: 'rgba(0,0,0,0.2)',
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
