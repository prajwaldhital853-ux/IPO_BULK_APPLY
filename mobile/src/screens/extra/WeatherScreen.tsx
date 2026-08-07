import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  NEPAL_CITIES,
  describeWeather,
  fetchWeatherForCity,
  windDirectionLabel,
  type WeatherBundle,
  type WeatherCity,
} from '../../services/weather/openMeteo';
import { rs } from '../../utils/responsive';
import type { RootStackParamList } from '../../navigation/types';

const CITY_KEY = '@nepse_ghar/weather_city_v1';
const DEFAULT_CITY = NEPAL_CITIES[0]!;

function ionIcon(
  name: string,
): keyof typeof Ionicons.glyphMap {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    sunny: 'sunny',
    moon: 'moon',
    'partly-sunny': 'partly-sunny',
    'cloudy-night': 'cloudy-night',
    cloudy: 'cloudy',
    cloud: 'cloud',
    rainy: 'rainy',
    snow: 'snow',
    thunderstorm: 'thunderstorm',
  };
  return map[name] ?? 'partly-sunny';
}

export function WeatherScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [city, setCity] = useState<WeatherCity>(DEFAULT_CITY);
  const [bundle, setBundle] = useState<WeatherBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(CITY_KEY);
        if (!raw) return;
        const found = NEPAL_CITIES.find((c) => c.id === raw);
        if (found) setCity(found);
      } catch {
        /* keep default */
      }
    })();
  }, []);

  const load = useCallback(
    async (target: WeatherCity, soft = false) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      if (!soft) setLoading(true);
      setError('');
      try {
        const data = await fetchWeatherForCity(target, ac.signal);
        if (ac.signal.aborted) return;
        setBundle(data);
      } catch (e) {
        if (ac.signal.aborted) return;
        setError(
          e instanceof Error ? e.message : 'Could not load weather right now.',
        );
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void load(city);
    return () => abortRef.current?.abort();
  }, [city, load]);

  const selectCity = async (next: WeatherCity) => {
    setCity(next);
    setPickerOpen(false);
    setCityQuery('');
    try {
      await AsyncStorage.setItem(CITY_KEY, next.id);
    } catch {
      /* ignore */
    }
  };

  const condition = describeWeather(
    bundle?.current.code ?? 0,
    bundle?.current.isDay ?? true,
  );
  const sky = condition.sky;

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    if (!q) return NEPAL_CITIES;
    return NEPAL_CITIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q),
    );
  }, [cityQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    void load(city, true);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.headerIcon}
        >
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Weather</Text>
        <Pressable
          onPress={() => setPickerOpen(true)}
          hitSlop={10}
          style={styles.headerIcon}
        >
          <Ionicons name="location-outline" size={rs(22)} color={colors.primary} />
        </Pressable>
      </View>

        {loading && !bundle ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.centerText}>Loading weather…</Text>
          </View>
        ) : error && !bundle ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={rs(40)} color={colors.textMuted} />
            <Text style={styles.centerText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load(city)}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : bundle ? (
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: Math.max(insets.bottom, rs(20)) },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.hero, { backgroundColor: sky }]}>
              <Pressable
                style={styles.cityBtn}
                onPress={() => setPickerOpen(true)}
              >
                <Ionicons name="location" size={rs(16)} color="#FFFFFF" />
                <Text style={styles.cityName}>{bundle.city.name}</Text>
                <Ionicons name="chevron-down" size={rs(16)} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.region}>{bundle.city.region}, Nepal</Text>

              <Ionicons
                name={ionIcon(condition.icon)}
                size={rs(72)}
                color="#FFFFFF"
                style={styles.heroIcon}
              />
              <Text style={styles.temp}>{bundle.current.temp}°</Text>
              <Text style={styles.condition}>{condition.label}</Text>
              <Text style={styles.feels}>
                Feels like {bundle.current.feelsLike}°
                {bundle.daily[0]
                  ? `  ·  H ${bundle.daily[0].tempMax}°  L ${bundle.daily[0].tempMin}°`
                  : ''}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Hourly</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hourlyRow}
            >
              {bundle.hourly.map((h) => {
                const c = describeWeather(h.code, true);
                return (
                  <View
                    key={h.time}
                    style={[styles.hourCard, h.isNow && styles.hourCardNow]}
                  >
                    <Text style={styles.hourLabel}>{h.hourLabel}</Text>
                    <Ionicons
                      name={ionIcon(c.icon)}
                      size={rs(22)}
                      color={colors.primary}
                    />
                    <Text style={styles.hourTemp}>{h.temp}°</Text>
                    {h.precipProb != null && h.precipProb > 0 ? (
                      <Text style={styles.hourPrecip}>{h.precipProb}%</Text>
                    ) : (
                      <Text style={styles.hourPrecip}> </Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <Text style={styles.sectionTitle}>7-day forecast</Text>
            <View style={styles.card}>
              {bundle.daily.map((d, i) => {
                const c = describeWeather(d.code, true);
                return (
                  <View
                    key={d.date}
                    style={[
                      styles.dayRow,
                      i < bundle.daily.length - 1 && styles.dayRowBorder,
                    ]}
                  >
                    <Text style={styles.dayLabel}>{d.dayLabel}</Text>
                    <Ionicons
                      name={ionIcon(c.icon)}
                      size={rs(20)}
                      color={colors.primary}
                      style={styles.dayIcon}
                    />
                    <Text style={styles.dayPrecip}>
                      {d.precipSum > 0 ? `${d.precipSum.toFixed(1)} mm` : '—'}
                    </Text>
                    <Text style={styles.dayMin}>{d.tempMin}°</Text>
                    <Text style={styles.dayMax}>{d.tempMax}°</Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Details</Text>
            <View style={styles.detailGrid}>
              <DetailTile
                styles={styles}
                icon="water-outline"
                label="Humidity"
                value={`${bundle.current.humidity}%`}
              />
              <DetailTile
                styles={styles}
                icon="navigate-outline"
                label="Wind"
                value={`${bundle.current.windSpeed} km/h ${windDirectionLabel(bundle.current.windDir)}`}
              />
              <DetailTile
                styles={styles}
                icon="sunny-outline"
                label="UV index"
                value={
                  bundle.uvMax != null ? `${bundle.uvMax.toFixed(1)}` : '—'
                }
              />
              <DetailTile
                styles={styles}
                icon="rainy-outline"
                label="Precip now"
                value={`${bundle.current.precip.toFixed(1)} mm`}
              />
              <DetailTile
                styles={styles}
                icon="sunny"
                label="Sunrise"
                value={bundle.sun.sunrise ?? '—'}
              />
              <DetailTile
                styles={styles}
                icon="moon"
                label="Sunset"
                value={bundle.sun.sunset ?? '—'}
              />
            </View>

            {error ? (
              <Text style={styles.softError}>{error}</Text>
            ) : null}
            <Text style={styles.source}>
              Data · Open-Meteo · Asia/Kathmandu
            </Text>
          </ScrollView>
        ) : null}

        <Modal
          visible={pickerOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setPickerOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPickerOpen(false)}
          />
          <View
            style={[
              styles.pickerSheet,
              { paddingBottom: Math.max(insets.bottom, rs(16)) },
            ]}
          >
            <Text style={styles.pickerTitle}>Choose city</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search Nepal cities…"
                placeholderTextColor={colors.textMuted}
                value={cityQuery}
                onChangeText={setCityQuery}
                autoFocus
              />
            </View>
            <ScrollView style={styles.cityList}>
              {filteredCities.map((c) => {
                const on = c.id === city.id;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.cityRow, on && styles.cityRowOn]}
                    onPress={() => void selectCity(c)}
                  >
                    <View>
                      <Text style={styles.cityRowName}>{c.name}</Text>
                      <Text style={styles.cityRowRegion}>{c.region}</Text>
                    </View>
                    {on ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={rs(22)}
                        color={colors.primary}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Modal>
      </View>
  );
}

function DetailTile({
  styles,
  icon,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.detailTile}>
      <Ionicons name={icon} size={rs(18)} color={colors.primary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? c.surface : '#FFFFFF';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(8),
      paddingVertical: rs(10),
      backgroundColor: c.bgElevated,
    },
    headerIcon: {
      width: rs(40),
      height: rs(40),
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(12),
      paddingHorizontal: rs(24),
    },
    centerText: {
      color: c.textMuted,
      fontSize: rs(13),
      textAlign: 'center',
      lineHeight: rs(18),
    },
    retryBtn: {
      marginTop: rs(4),
      backgroundColor: c.primary,
      paddingHorizontal: rs(18),
      paddingVertical: rs(10),
      borderRadius: rs(10),
    },
    retryText: { color: '#FFF', fontWeight: '800', fontSize: rs(13) },
    scroll: { paddingBottom: rs(24) },
    hero: {
      marginHorizontal: rs(14),
      marginTop: rs(10),
      borderRadius: rs(20),
      paddingVertical: rs(22),
      paddingHorizontal: rs(18),
      alignItems: 'center',
      overflow: 'hidden',
    },
    cityBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
    },
    cityName: {
      color: '#FFFFFF',
      fontSize: rs(18),
      fontWeight: '800',
    },
    region: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: rs(12),
      marginTop: rs(2),
      fontWeight: '600',
    },
    heroIcon: { marginTop: rs(10), marginBottom: rs(2) },
    temp: {
      color: '#FFFFFF',
      fontSize: rs(64),
      fontWeight: '200',
      lineHeight: rs(70),
    },
    condition: {
      color: '#FFFFFF',
      fontSize: rs(18),
      fontWeight: '700',
      marginTop: rs(2),
    },
    feels: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: rs(13),
      marginTop: rs(6),
      fontWeight: '600',
    },
    sectionTitle: {
      marginHorizontal: rs(16),
      marginTop: rs(18),
      marginBottom: rs(8),
      color: c.text,
      fontSize: rs(14),
      fontWeight: '800',
    },
    hourlyRow: {
      paddingHorizontal: rs(14),
      gap: rs(8),
    },
    hourCard: {
      width: rs(64),
      paddingVertical: rs(10),
      borderRadius: rs(14),
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      gap: rs(4),
    },
    hourCardNow: {
      borderColor: c.primary,
      borderWidth: 1.5,
    },
    hourLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
    },
    hourTemp: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '800',
    },
    hourPrecip: {
      color: '#29B6F6',
      fontSize: rs(10),
      fontWeight: '700',
      minHeight: rs(12),
    },
    card: {
      marginHorizontal: rs(14),
      backgroundColor: cardBg,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: rs(12),
      paddingVertical: rs(4),
    },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(11),
      gap: rs(8),
    },
    dayRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    dayLabel: {
      width: rs(78),
      color: c.text,
      fontWeight: '700',
      fontSize: rs(13),
    },
    dayIcon: { width: rs(24) },
    dayPrecip: {
      flex: 1,
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '600',
    },
    dayMin: {
      width: rs(36),
      textAlign: 'right',
      color: c.textMuted,
      fontWeight: '700',
      fontSize: rs(13),
    },
    dayMax: {
      width: rs(36),
      textAlign: 'right',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
    },
    detailGrid: {
      marginHorizontal: rs(14),
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(10),
    },
    detailTile: {
      width: '47.5%',
      flexGrow: 1,
      backgroundColor: cardBg,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.border,
      padding: rs(12),
      gap: rs(4),
      minWidth: rs(140),
    },
    detailLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
      marginTop: rs(2),
    },
    detailValue: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '800',
    },
    softError: {
      marginHorizontal: rs(16),
      marginTop: rs(12),
      color: c.danger || '#C62828',
      fontSize: rs(12),
    },
    source: {
      marginTop: rs(14),
      textAlign: 'center',
      color: c.textMuted,
      fontSize: rs(11),
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
    },
    pickerSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      maxHeight: '72%',
      paddingTop: rs(14),
      paddingHorizontal: rs(14),
    },
    pickerTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      marginBottom: rs(10),
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderWidth: 1.5,
      borderColor: c.textDim,
      borderRadius: rs(12),
      paddingHorizontal: rs(12),
      marginBottom: rs(8),
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(14),
      paddingVertical: rs(10),
    },
    cityList: { maxHeight: rs(360) },
    cityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    cityRowOn: {
      backgroundColor: isDark ? 'rgba(45,138,57,0.12)' : '#E8F5E9',
      marginHorizontal: rs(-6),
      paddingHorizontal: rs(6),
      borderRadius: rs(8),
    },
    cityRowName: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
    },
    cityRowRegion: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(2),
    },
  });
}
