import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Header } from "../App";
import * as echarts from "echarts";

const PALETTE = [
  "#58a6ff", "#3fb950", "#d29922", "#f85149", "#a371f7",
  "#79c0ff", "#7ee787", "#e3b341", "#ffa198", "#d2a8ff",
];

interface RawEntry {
  time: string;
  request_id: string;
  key_name: string;
  input_model: string;
  output_model: string;
  ttft_ms: string;
  tps: string;
  input_tokens: string;
  output_tokens: string;
}

interface Entry {
  time: Date;
  outputModel: string;
  keyName: string;
  tps: number;
  ttftMs: number;
  inputTokens: number;
  outputTokens: number;
}

interface ModelStat {
  model: string;
  count: number;
  avgTps: number;
  avgTtft: number;
  inputTokens: number;
  outputTokens: number;
}

// ── Theme colors ──────────────────────────────────────

interface Colors {
  text: string;
  textSecondary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  border: string;
  bgSecondary: string;
}

function readColors(): Colors {
  const s = getComputedStyle(document.documentElement);
  const g = (v: string) => s.getPropertyValue(v).trim();
  return {
    text: g("--text"),
    textSecondary: g("--text-secondary"),
    accent: g("--accent"),
    success: g("--success"),
    warning: g("--warning"),
    error: g("--error"),
    border: g("--border"),
    bgSecondary: g("--bg-secondary"),
  };
}

function useThemeColors() {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const ob = new MutationObserver(() => setColors(readColors()));
    ob.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => ob.disconnect();
  }, []);
  return colors;
}

// ── Data helpers ──────────────────────────────────────

function parse(raw: RawEntry[]): Entry[] {
  return raw
    .map((e) => ({
      time: new Date(e.time),
      outputModel: e.output_model,
      keyName: e.key_name,
      tps: parseFloat(e.tps) || 0,
      ttftMs: parseInt(e.ttft_ms) || 0,
      inputTokens: parseInt(e.input_tokens) || 0,
      outputTokens: parseInt(e.output_tokens) || 0,
    }))
    .filter((e) => !isNaN(e.time.getTime()));
}

function modelAgg(entries: Entry[]): ModelStat[] {
  const m = new Map<
    string,
    {
      count: number;
      tpsS: number;
      tpsN: number;
      ttftS: number;
      ttftN: number;
      inTok: number;
      outTok: number;
    }
  >();
  for (const e of entries) {
    const s = m.get(e.outputModel) ?? {
      count: 0,
      tpsS: 0,
      tpsN: 0,
      ttftS: 0,
      ttftN: 0,
      inTok: 0,
      outTok: 0,
    };
    s.count++;
    if (e.tps > 0) {
      s.tpsS += e.tps;
      s.tpsN++;
    }
    if (e.ttftMs > 0) {
      s.ttftS += e.ttftMs;
      s.ttftN++;
    }
    s.inTok += e.inputTokens;
    s.outTok += e.outputTokens;
    m.set(e.outputModel, s);
  }
  return Array.from(m.entries())
    .map(([model, s]) => ({
      model,
      count: s.count,
      avgTps: s.tpsN > 0 ? s.tpsS / s.tpsN : 0,
      avgTtft: s.ttftN > 0 ? s.ttftS / s.ttftN : 0,
      inputTokens: s.inTok,
      outputTokens: s.outTok,
    }))
    .sort((a, b) => b.count - a.count);
}

function dailyAgg(entries: Entry[]) {
  const m = new Map<string, number>();
  for (const e of entries) {
    const k = e.time.toISOString().slice(0, 10);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

function hourlyAgg(entries: Entry[]) {
  const m = new Map<string, number>();
  for (const e of entries) {
    const k = e.time.toISOString().slice(0, 13);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, count]) => ({ hour: hour.slice(5) + ":00", count }));
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function truncLabel(s: string, max = 20) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d" | "all" | "custom";
const TIME_PRESETS: { key: TimeRange; label: string }[] = [
  { key: "1h", label: "1H" },
  { key: "6h", label: "6H" },
  { key: "24h", label: "24H" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "all", label: "All" },
];
const RANGE_MS: Record<string, number> = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

function toLocalISOString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── EChart wrapper ────────────────────────────────────

function EChart({
  option,
  height = 300,
  onChartClick,
}: {
  option: echarts.EChartsOption;
  height?: number;
  onChartClick?: (params: echarts.ECElementEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onChartClick) return;
    chart.on("click", onChartClick);
    return () => {
      chart.off("click", onChartClick);
    };
  }, [onChartClick]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}

// ── Sub-components ────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

function ChartCard({
  title,
  span,
  children,
}: {
  title: string;
  span?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="chart-card"
      style={span ? { gridColumn: `span ${span}` } : undefined}
    >
      <div className="chart-card-title">{title}</div>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [raw, setRaw] = useState<RawEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const colors = useThemeColors();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/history");
      if (!res.ok) return;
      const data = await res.json();
      setRaw(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const all = useMemo(() => parse(raw), [raw]);

  // time range filter
  const timeFiltered = useMemo(() => {
    if (timeRange === "all") return all;
    if (timeRange === "custom") {
      const from = customFrom ? new Date(customFrom).getTime() : 0;
      const to = customTo ? new Date(customTo).getTime() : Date.now();
      return all.filter((e) => {
        const t = e.time.getTime();
        return t >= from && t <= to;
      });
    }
    const cutoff = Date.now() - RANGE_MS[timeRange];
    return all.filter((e) => e.time.getTime() >= cutoff);
  }, [all, timeRange, customFrom, customTo]);

  // model filter on top of time filter
  const filtered = useMemo(
    () =>
      selectedModel
        ? timeFiltered.filter((e) => e.outputModel === selectedModel)
        : timeFiltered,
    [timeFiltered, selectedModel],
  );

  const handlePreset = useCallback((key: TimeRange) => {
    setTimeRange(key);
    if (key !== "custom") {
      setCustomFrom("");
      setCustomTo("");
    }
  }, []);

  const handleCustomFrom = useCallback(
    (v: string) => {
      setCustomFrom(v);
      if (timeRange !== "custom") setTimeRange("custom");
    },
    [timeRange],
  );

  const handleCustomTo = useCallback(
    (v: string) => {
      setCustomTo(v);
      if (timeRange !== "custom") setTimeRange("custom");
    },
    [timeRange],
  );

  // stats for summary cards (filtered)
  const overview = useMemo(() => {
    if (filtered.length === 0) return null;
    const validTps = filtered.filter((e) => e.tps > 0);
    const validTtft = filtered.filter((e) => e.ttftMs > 0);
    return {
      total: filtered.length,
      avgTps:
        validTps.length > 0
          ? validTps.reduce((s, e) => s + e.tps, 0) / validTps.length
          : 0,
      avgTtft:
        validTtft.length > 0
          ? validTtft.reduce((s, e) => s + e.ttftMs, 0) / validTtft.length
          : 0,
      inTok: filtered.reduce((s, e) => s + e.inputTokens, 0),
      outTok: filtered.reduce((s, e) => s + e.outputTokens, 0),
    };
  }, [filtered]);

  // model breakdown from time-filtered data (pie chart respects time range)
  const allModels = useMemo(() => modelAgg(timeFiltered), [timeFiltered]);
  // model breakdown filtered
  const fModels = useMemo(() => modelAgg(filtered), [filtered]);

  // timeline
  const daily = useMemo(() => dailyAgg(filtered), [filtered]);
  const hourly = useMemo(() => hourlyAgg(filtered), [filtered]);
  const useHourly = daily.length <= 3;
  const timeline = useHourly ? hourly : daily;

  // ── Shared tooltip style ─────────────────────────

  const tip = useMemo(
    () => ({
      backgroundColor: colors.bgSecondary,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 12 },
    }),
    [colors],
  );

  const axBase = useMemo(
    () => ({
      axisLabel: { color: colors.textSecondary, fontSize: 11 },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.3 } },
    }),
    [colors],
  );

  // ── Chart options ────────────────────────────────

  const volumeOpt = useMemo<echarts.EChartsOption>(
    () => ({
      tooltip: { trigger: "axis", ...tip },
      grid: { left: 50, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: "category",
        data: timeline.map((d) =>
          "date" in d ? (d as { date: string }).date.slice(5) : (d as { hour: string }).hour,
        ),
        ...axBase,
      },
      yAxis: { type: "value", ...axBase },
      series: [
        {
          type: "bar",
          data: timeline.map((d) => d.count),
          itemStyle: { color: colors.accent, borderRadius: [3, 3, 0, 0] },
        },
      ],
    }),
    [timeline, colors, tip, axBase],
  );

  const pieOpt = useMemo<echarts.EChartsOption>(
    () => ({
      tooltip: { trigger: "item", ...tip },
      series: [
        {
          type: "pie",
          radius: ["40%", "72%"],
          itemStyle: { borderColor: "transparent", borderWidth: 2 },
          label: { color: colors.text, fontSize: 11, formatter: "{b}\n{d}%" },
          data: allModels.map((m, i) => ({
            name: m.model,
            value: m.count,
            itemStyle: {
              color:
                selectedModel === m.model
                  ? colors.accent
                  : selectedModel
                    ? colors.border
                    : PALETTE[i % PALETTE.length],
            },
          })),
        },
      ],
    }),
    [allModels, colors, selectedModel, tip],
  );

  const tpsOpt = useMemo<echarts.EChartsOption>(() => {
    const h = Math.max(200, fModels.length * 40);
    return {
      tooltip: { trigger: "axis", ...tip },
      grid: { left: 130, right: 24, top: 8, bottom: 8 },
      xAxis: { type: "value", ...axBase },
      yAxis: {
        type: "category",
        data: fModels.map((m) => truncLabel(m.model)),
        ...axBase,
        inverse: true,
      },
      series: [
        {
          type: "bar",
          data: fModels.map((m) => Number(m.avgTps.toFixed(1))),
          itemStyle: { color: colors.success, borderRadius: [0, 3, 3, 0] },
          label: {
            show: true,
            position: "right",
            color: colors.textSecondary,
            fontSize: 11,
            formatter: (p: { value: number }) => p.value.toFixed(1),
          },
        },
      ],
      _h: h,
    } as echarts.EChartsOption & { _h: number };
  }, [fModels, colors, tip, axBase]);

  const ttftOpt = useMemo<echarts.EChartsOption>(() => {
    const h = Math.max(200, fModels.length * 40);
    return {
      tooltip: { trigger: "axis", ...tip },
      grid: { left: 130, right: 24, top: 8, bottom: 8 },
      xAxis: {
        type: "value",
        ...axBase,
        axisLabel: { ...axBase.axisLabel, formatter: (v: number) => `${v}ms` },
      },
      yAxis: {
        type: "category",
        data: fModels.map((m) => truncLabel(m.model)),
        ...axBase,
        inverse: true,
      },
      series: [
        {
          type: "bar",
          data: fModels.map((m) => Math.round(m.avgTtft)),
          itemStyle: { color: colors.warning, borderRadius: [0, 3, 3, 0] },
          label: {
            show: true,
            position: "right",
            color: colors.textSecondary,
            fontSize: 11,
            formatter: (p: { value: number }) => `${p.value}ms`,
          },
        },
      ],
      _h: h,
    } as echarts.EChartsOption & { _h: number };
  }, [fModels, colors, tip, axBase]);

  const tokenOpt = useMemo<echarts.EChartsOption>(() => {
    const h = Math.max(200, fModels.length * 40);
    return {
      tooltip: { trigger: "axis", ...tip },
      legend: {
        data: [t("analytics.inputTokens"), t("analytics.outputTokens")],
        textStyle: { color: colors.textSecondary, fontSize: 11 },
        top: 0,
      },
      grid: { left: 130, right: 24, top: 28, bottom: 8 },
      xAxis: { type: "value", ...axBase },
      yAxis: {
        type: "category",
        data: fModels.map((m) => truncLabel(m.model)),
        ...axBase,
        inverse: true,
      },
      series: [
        {
          name: t("analytics.inputTokens"),
          type: "bar",
          stack: "tok",
          data: fModels.map((m) => m.inputTokens),
          itemStyle: { color: colors.accent },
        },
        {
          name: t("analytics.outputTokens"),
          type: "bar",
          stack: "tok",
          data: fModels.map((m) => m.outputTokens),
          itemStyle: { color: colors.success },
        },
      ],
      _h: h,
    } as echarts.EChartsOption & { _h: number };
  }, [fModels, colors, tip, axBase, t]);

  // ── Click handlers ───────────────────────────────

  const onModelClick = useCallback((p: echarts.ECElementEvent) => {
    if (p.name) setSelectedModel((prev) => (prev === p.name ? null : p.name));
  }, []);

  const onBarClick = useCallback(
    (p: echarts.ECElementEvent) => {
      const idx = p.dataIndex;
      if (idx != null && idx < fModels.length) {
        const model = fModels[idx].model;
        setSelectedModel((prev) => (prev === model ? null : model));
      }
    },
    [fModels],
  );

  // ── Render ───────────────────────────────────────

  if (loading) {
    return (
      <div className="app">
        <Header>
          <button onClick={fetchData} className="btn-clear">{t("common.refresh")}</button>
        </Header>
        <div className="empty">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header>
        <button onClick={fetchData} className="btn-clear">{t("common.refresh")}</button>
      </Header>

      <div className="analytics-page">
        <div className="time-filter">
          <div className="time-presets">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.key}
                className={`time-preset-btn ${timeRange === p.key ? "time-preset-active" : ""}`}
                onClick={() => handlePreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="time-custom">
            <input
              type="datetime-local"
              className="time-input"
              value={customFrom}
              onChange={(e) => handleCustomFrom(e.target.value)}
              placeholder="From"
            />
            <span className="time-sep">-</span>
            <input
              type="datetime-local"
              className="time-input"
              value={customTo || (timeRange === "custom" ? toLocalISOString(new Date()) : "")}
              onChange={(e) => handleCustomTo(e.target.value)}
              placeholder="To"
            />
          </div>
        </div>

        {selectedModel && (
          <div className="analytics-filter">
            <span>
              {t("analytics.filteredBy")} <strong>{selectedModel}</strong>
            </span>
            <button
              className="btn-sm"
              onClick={() => setSelectedModel(null)}
            >
              {t("analytics.clear")}
            </button>
          </div>
        )}

        {overview ? (
          <>
            <div className="analytics-cards">
              <StatCard label={t("analytics.totalRequests")} value={fmtNum(overview.total)} />
              <StatCard label={t("analytics.avgTps")} value={overview.avgTps.toFixed(1)} />
              <StatCard
                label={t("analytics.avgTtft")}
                value={`${Math.round(overview.avgTtft)}ms`}
              />
              <StatCard
                label={t("analytics.totalTokens")}
                value={fmtNum(overview.inTok + overview.outTok)}
                sub={t("analytics.inOut", { in: fmtNum(overview.inTok), out: fmtNum(overview.outTok) })}
              />
            </div>

            <div className="analytics-grid">
              <ChartCard
                title={useHourly ? t("analytics.requestVolumeHourly") : t("analytics.requestVolumeDaily")}
                span={2}
              >
                <EChart option={volumeOpt} height={240} />
              </ChartCard>

              <ChartCard title={t("analytics.modelDistribution")}>
                <EChart option={pieOpt} height={300} onChartClick={onModelClick} />
              </ChartCard>

              <ChartCard title={t("analytics.avgTpsByModel")}>
                <EChart
                  option={tpsOpt}
                  height={Math.max(200, fModels.length * 40)}
                  onChartClick={onBarClick}
                />
              </ChartCard>

              <ChartCard title={t("analytics.avgTtftByModel")}>
                <EChart
                  option={ttftOpt}
                  height={Math.max(200, fModels.length * 40)}
                  onChartClick={onBarClick}
                />
              </ChartCard>

              <ChartCard title={t("analytics.tokenUsageByModel")} span={2}>
                <EChart
                  option={tokenOpt}
                  height={Math.max(220, fModels.length * 40)}
                  onChartClick={onBarClick}
                />
              </ChartCard>
            </div>
          </>
        ) : (
          <div className="empty">{t("analytics.noData")}</div>
        )}
      </div>
    </div>
  );
}
