import React, { useCallback, useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StockRankList } from '../components/nepse/StockRankList';
import {
  loadStockList,
  stockListTitle,
  type StockRankRow,
} from '../services/nepse/screener';
import type { RootStackParamList } from '../navigation/types';
import { usePollingRefresh } from '../utils/usePollingRefresh';

type Props = NativeStackScreenProps<RootStackParamList, 'StockList'>;

export function StockListScreen({ route }: Props) {
  const { kind } = route.params;
  const [rows, setRows] = useState<StockRankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await loadStockList(kind);
      setRows(data.map((r, i) => ({ ...r, rank: i + 1 })));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  return (
    <StockRankList
      title={stockListTitle(kind)}
      rows={rows}
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void refresh(true);
      }}
      showYield={kind === 'high-dividend'}
    />
  );
}
