import React from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { useAppBranding } from '../context/AppBrandingContext';
import { rs } from '../utils/responsive';

type Props = {
  /** 'mark' = compact icon for headers; 'full' = full logo with wordmark */
  variant?: 'mark' | 'full';
  height?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

const localLogo = require('../../assets/nepse-ghar-logo.png');

/** NEPSE GHAR brand logo — uses admin-uploaded logo when available */
export function BrandLogo({
  variant = 'full',
  height,
  style,
  imageStyle,
}: Props) {
  const { appLogoUrl } = useAppBranding();
  const h = height ?? (variant === 'mark' ? rs(36) : rs(72));
  const aspect = variant === 'mark' ? 1.15 : 1.55;

  return (
    <View style={[styles.wrap, style]}>
      <Image
        source={appLogoUrl ? { uri: appLogoUrl } : localLogo}
        style={[
          {
            height: h,
            width: h * aspect,
          },
          imageStyle,
        ]}
        resizeMode="contain"
        accessibilityLabel="NEPSE GHAR"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
