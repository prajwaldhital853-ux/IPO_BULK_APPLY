import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { TAB_ACTIVE_GRADIENT } from '../../theme/glassUi';
import { rs } from '../../utils/responsive';
import { HOME_H_PAD } from './homeLayout';

type HomeTab = 'Accounts' | 'Market';

type Props = {
  tab: HomeTab;
  onChange: (tab: HomeTab) => void;
};

export function HomeTabSwitcher({ tab, onChange }: Props) {
  const { isDark } = useTheme();
  const trackBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)';
  const idle = isDark ? '#9AA0A6' : '#64748B';

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: trackBg,
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.95)',
        },
      ]}
    >
      {(['Accounts', 'Market'] as const).map((key) => {
        const active = tab === key;
        const color = active ? '#FFFFFF' : idle;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={styles.item}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {active ? (
              <LinearGradient
                colors={[...TAB_ACTIVE_GRADIENT]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            {key === 'Accounts' ? (
              <Ionicons
                name={active ? 'person' : 'person-outline'}
                size={rs(16)}
                color={color}
              />
            ) : (
              <MaterialCommunityIcons
                name="chart-bar"
                size={rs(16)}
                color={color}
              />
            )}
            <Text style={[styles.label, { color }]}>{key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    marginHorizontal: HOME_H_PAD,
    marginTop: rs(8),
    marginBottom: rs(4),
    padding: rs(4),
    borderRadius: rs(28),
    minHeight: rs(50),
    borderWidth: 1.5,
    shadowColor: '#A5F3FC',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 2,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    borderRadius: rs(24),
    overflow: 'hidden',
    minHeight: rs(42),
  },
  label: {
    fontSize: rs(14),
    fontWeight: '800',
  },
});
