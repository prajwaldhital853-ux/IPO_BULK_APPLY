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
import { usePullToRefresh } from '../utils/usePullToRefresh';

type Props = NativeStackScreenProps<RootStackParamList, 'StockList'>;

export function StockListScreen({ route }: Props) {
  const { kind } = route.params;
  const [rows, setRows] = useState<StockRankRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await loadStockList(kind);
      setRows(data.map((r, i) => ({ ...r, rank: i + 1 })));
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const { refreshing, onRefresh } = usePullToRefresh(() => refresh(true));

  return (
    <StockRankList
      title={stockListTitle(kind)}
      rows={rows}
      loading={loading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      showYield={kind === 'high-dividend'}
    />
  );
}
