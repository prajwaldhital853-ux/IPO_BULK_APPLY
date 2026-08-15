import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  NepseMarketChart,
  type NepseMarketChartHandle,
} from './NepseMarketChart';
import {
  INDEX_CHART_RANGES,
  loadIndexChartPoints,
  type IndexChartRange,
} from '../../services/nepse/indexChart';
import type { ChartPoint, IndexQuote } from '../../services/nepse';
import type { ThemeColors } from '../../theme/colors';
import { rs } from '../../utils/responsive';

export const MARKET_CHART_HEIGHT = rs(232);

type ModelInput = {
  indexQuote: IndexQuote;
  sectorOptions: IndexQuote[];
  selectedIndex: IndexQuote | null;
  onSelectIndex: (index: IndexQuote | null) => void;
  intradayPoints: ChartPoint[];
  isDark: boolean;
  colors: ThemeColors;
  onSearchPress?: () => void;
  chartRef?: React.Ref<NepseMarketChartHandle>;
  externalScrub?: boolean;
  /** Live 1D ticks only while NEPSE is actually open. */
  marketOpen?: boolean;
};

function indexSymbol(index: IndexQuote | null, fallback = 'NEPSE'): string {
  if (!index) return fallback;
  return (index.symbol ?? index.name).toUpperCase().replace(/\s+/g, '');
}

/** Shared chart state for inline or pinned (Summary-cover) layouts. */
export function useMarketChartModel({
  indexQuote,
  sectorOptions,
  selectedIndex,
  onSelectIndex,
  intradayPoints,
  isDark,
  colors,
  onSearchPress,
  chartRef,
  externalScrub = false,
  marketOpen = false,
}: ModelInput) {
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [range, setRange] = useState<IndexChartRange>('1D');
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>(intradayPoints);
  const [chartLoading, setChartLoading] = useState(false);
  const [indexMenuOpen, setIndexMenuOpen] = useState(false);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);

  const sym = indexSymbol(selectedIndex);
  const up = (indexQuote.change ?? 0) >= 0;
  const rangeLabel =
    INDEX_CHART_RANGES.find((r) => r.id === range)?.label ?? '1 Day';
  const iconColor = isDark ? colors.sage : '#4A5544';
  const chartBg = isDark ? colors.bg : '#F9FAF2';

  const loadChart = useCallback(async () => {
    // 1D is synthetic/local — paint immediately, no spinner.
    const showSpinner = range !== '1D';
    if (showSpinner) setChartLoading(true);
    try {
      const pts = await loadIndexChartPoints(sym, range, intradayPoints, {
        current: indexQuote.current,
        change: indexQuote.change,
        marketOpen,
      });
      setChartPoints(pts);
    } finally {
      if (showSpinner) setChartLoading(false);
    }
  }, [
    sym,
    range,
    intradayPoints,
    indexQuote.current,
    indexQuote.change,
    marketOpen,
  ]);

  useEffect(() => {
    void loadChart();
  }, [loadChart]);

  const controls = (
    <View style={styles.controls}>
      <Pressable style={styles.dropdown} onPress={() => setIndexMenuOpen(true)}>
        <Ionicons name="list" size={rs(15)} color={iconColor} />
        <Text style={styles.dropdownText} numberOfLines={1}>
          {indexQuote.name}
        </Text>
        <Ionicons name="chevron-down" size={rs(14)} color={iconColor} />
      </Pressable>
      <Pressable style={styles.dropdown} onPress={() => setRangeMenuOpen(true)}>
        <Ionicons name="calendar-outline" size={rs(14)} color={iconColor} />
        <Text style={styles.dropdownText}>{rangeLabel}</Text>
        <Ionicons name="chevron-down" size={rs(14)} color={iconColor} />
      </Pressable>
      {onSearchPress ? (
        <Pressable style={styles.searchBtn} onPress={onSearchPress} hitSlop={8}>
          <Ionicons name="search" size={rs(18)} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );

  const chart = (
    <NepseMarketChart
      ref={chartRef}
      points={chartPoints}
      isDark={isDark}
      up={up}
      loading={chartLoading}
      height={MARKET_CHART_HEIGHT}
      backgroundColor={chartBg}
      externalScrub={externalScrub}
    />
  );

  const modals = (
    <>
      <Modal visible={indexMenuOpen} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIndexMenuOpen(false)}
          />
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle}>Select index</Text>
            <ScrollView style={styles.menuScroll}>
              {sectorOptions.map((opt) => {
                const active =
                  (selectedIndex?.name ?? 'NEPSE') === opt.name ||
                  (!selectedIndex && opt.name === 'NEPSE');
                return (
                  <Pressable
                    key={opt.name}
                    style={[styles.menuItem, active && styles.menuItemActive]}
                    onPress={() => {
                      onSelectIndex(opt.name === 'NEPSE' ? null : opt);
                      setIndexMenuOpen(false);
                    }}
                  >
                    <Text style={styles.menuItemText}>{opt.name}</Text>
                    {active ? (
                      <Ionicons
                        name="checkmark"
                        size={rs(16)}
                        color={colors.primary}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={rangeMenuOpen} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setRangeMenuOpen(false)}
          />
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle}>Time range</Text>
            {INDEX_CHART_RANGES.map((opt) => (
              <Pressable
                key={opt.id}
                style={[
                  styles.menuItem,
                  range === opt.id && styles.menuItemActive,
                ]}
                onPress={() => {
                  setRange(opt.id);
                  setRangeMenuOpen(false);
                }}
              >
                <Text style={styles.menuItemText}>{opt.label}</Text>
                {range === opt.id ? (
                  <Ionicons
                    name="checkmark"
                    size={rs(16)}
                    color={colors.primary}
                  />
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );

  return { controls, chart, modals, styles, chartBg };
}

type Props = ModelInput & {
  style?: StyleProp<ViewStyle>;
};

/** Default inline chart block (controls + graph). */
export function MarketChartSection(props: Props) {
  const { style, ...modelInput } = props;
  const { controls, chart, modals, styles } = useMarketChartModel(modelInput);
  return (
    <View style={[styles.wrap, style]}>
      {controls}
      {chart}
      {modals}
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    wrap: {
      marginTop: rs(2),
      backgroundColor: isDark ? c.bg : '#F9FAF2',
      borderRadius: rs(4),
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(6),
    },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingHorizontal: rs(12),
      paddingVertical: rs(9),
      borderRadius: rs(16),
      backgroundColor: isDark ? c.surfaceAlt : '#E4EDD8',
      maxWidth: rs(148),
    },
    dropdownText: {
      color: isDark ? c.sage : '#3E4638',
      fontSize: rs(12),
      fontWeight: '700',
      flexShrink: 1,
    },
    searchBtn: {
      marginLeft: 'auto',
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      backgroundColor: isDark ? c.accentGreen : '#1B5E20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: rs(24) },
    menuSheet: {
      backgroundColor: c.surface,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.border,
      maxHeight: rs(400),
      overflow: 'hidden',
    },
    menuTitle: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
      paddingHorizontal: rs(16),
      paddingTop: rs(14),
      paddingBottom: rs(6),
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    menuScroll: { maxHeight: rs(320) },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(13),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderMuted,
    },
    menuItemActive: { backgroundColor: c.primarySoft },
    menuItemText: { color: c.text, fontWeight: '600', fontSize: rs(14) },
  });
}
