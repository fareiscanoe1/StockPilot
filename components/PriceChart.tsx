"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type WhitespaceData,
  type CandlestickData,
} from "lightweight-charts";

type Candle = { time: string; o: number; h: number; l: number; c: number };

export function PriceChart({ data, height = 280 }: { data: Candle[]; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#c6d2ea",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
      timeScale: { borderColor: "rgba(255,255,255,0.1)" },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#f87171",
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: host.current?.clientWidth ?? 400 });
    });
    ro.observe(host.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s || !data.length) return;
    const rows = data.map((c) => {
      const row: CandlestickData<Time> | WhitespaceData<Time> = {
        time: c.time.slice(0, 10) as Time,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      };
      return row;
    });
    s.setData(rows);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={host} className="w-full" style={{ minHeight: height }} />;
}
