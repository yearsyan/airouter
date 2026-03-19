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
      tpsW: number;   // sum(tps * outputTokens) — weighted numerator
      tpsWt: number;  // sum(outputTokens) — weight denominator
      ttftS: number;
      ttftN: number;
      inTok: number;
      outTok: number;
    }
  >();
  for (const e of entries) {
    const s = m.get(e.outputModel) ?? {
      count: 0,
      tpsW: 0,
      tpsWt: 0,
      ttftS: 0,
      ttftN: 0,
      inTok: 0,
      outTok: 0,
    };
    s.count++;
    if (e.tps > 0 && e.outputTokens > 0) {
      s.tpsW += e.tps * e.outputTokens;
      s.tpsWt += e.outputTokens;
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
      avgTps: s.tpsWt > 0 ? s.tpsW / s.tpsWt : 0,
      avgTtft: s.ttftN > 0 ? s.ttftS / s.ttftN : 0,
      inputTokens: s.inTok,
      outputTokens: s.outTok,
    }))
    .sort((a, b) => b.count - a.count);
}

interface UserStat {
  user: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
}

function userAgg(entries: Entry[]): UserStat[] {
  const m = new Map<string, { count: number; inTok: number; outTok: number }>();
  for (const e of entries) {
    const key = e.keyName || "-";
    const s = m.get(key) ?? { count: 0, inTok: 0, outTok: 0 };
    s.count++;
    s.inTok += e.inputTokens;
    s.outTok += e.outputTokens;
    m.set(key, s);
  }
  return Array.from(m.entries())
    .map(([user, s]) => ({
      user,
      count: s.count,
      inputTokens: s.inTok,
      outputTokens: s.outTok,
    }))
    .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
}

interface TimeSlot {
  label: string;
  byModel: Map<string, number>;
}

function timelineAgg(entries: Entry[], mode: "daily" | "hourly"): { slots: TimeSlot[]; models: string[] } {
  const slotMap = new Map<string, Map<string, number>>();
  const modelSet = new Set<string>();
  for (const e of entries) {
    const k = mode === "daily"
      ? e.time.toISOString().slice(0, 10)
      : e.time.toISOString().slice(0, 13);
    modelSet.add(e.outputModel);
    if (!slotMap.has(k)) slotMap.set(k, new Map());
    const m = slotMap.get(k)!;
    m.set(e.outputModel, (m.get(e.outputModel) ?? 0) + 1);
  }
  const slots = Array.from(slotMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, byModel]) => ({
      label: mode === "daily" ? key.slice(5) : key.slice(5) + ":00",
      byModel,
    }));
  const models = Array.from(modelSet);
  return { slots, models };
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
    const validTps = filtered.filter((e) => e.tps > 0 && e.outputTokens > 0);
    const tpsWeightSum = validTps.reduce((s, e) => s + e.outputTokens, 0);
    const validTtft = filtered.filter((e) => e.ttftMs > 0);
    return {
      total: filtered.length,
      avgTps:
        tpsWeightSum > 0
          ? validTps.reduce((s, e) => s + e.tps * e.outputTokens, 0) / tpsWeightSum
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

  // user breakdown (filtered)
  const fUsers = useMemo(() => userAgg(filtered), [filtered]);

  // timeline
  const dailyTl = useMemo(() => timelineAgg(filtered, "daily"), [filtered]);
  const hourlyTl = useMemo(() => timelineAgg(filtered, "hourly"), [filtered]);
  const useHourly = dailyTl.slots.length <= 3;
  const timeline = useHourly ? hourlyTl : dailyTl;

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

  const volumeOpt = useMemo<echarts.EChartsOption>(() => {
    const { slots, models } = timeline;
    // Stable color per model based on allModels order
    const modelColorMap = new Map<string, string>();
    allModels.forEach((m, i) => modelColorMap.set(m.model, PALETTE[i % PALETTE.length]));
    models.forEach((m, i) => {
      if (!modelColorMap.has(m)) modelColorMap.set(m, PALETTE[i % PALETTE.length]);
    });

    return {
      tooltip: { trigger: "axis", ...tip },
      legend: {
        data: models,
        textStyle: { color: colors.textSecondary, fontSize: 11 },
        top: 0,
        type: "scroll",
        pageTextStyle: { color: colors.textSecondary },
      },
      grid: { left: 50, right: 16, top: 32, bottom: 28 },
      xAxis: {
        type: "category",
        data: slots.map((s) => s.label),
        ...axBase,
      },
      yAxis: { type: "value", ...axBase },
      series: models.map((model) => ({
        name: model,
        type: "bar" as const,
        stack: "vol",
        data: slots.map((s) => s.byModel.get(model) ?? 0),
        itemStyle: {
          color: selectedModel
            ? model === selectedModel
              ? modelColorMap.get(model)!
              : colors.border
            : modelColorMap.get(model)!,
        },
      })),
    };
  }, [timeline, allModels, colors, selectedModel, tip, axBase]);

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

  const userTokenOpt = useMemo<echarts.EChartsOption>(() => {
    const h = Math.max(200, fUsers.length * 40);
    return {
      tooltip: { trigger: "axis", ...tip },
      legend: {
        data: [t("analytics.inputTokens"), t("analytics.outputTokens")],
        textStyle: { color: colors.textSecondary, fontSize: 11 },
        top: 0,
      },
      grid: { left: 100, right: 24, top: 28, bottom: 8 },
      xAxis: { type: "value", ...axBase },
      yAxis: {
        type: "category",
        data: fUsers.map((u) => truncLabel(u.user, 14)),
        ...axBase,
        inverse: true,
      },
      series: [
        {
          name: t("analytics.inputTokens"),
          type: "bar",
          stack: "tok",
          data: fUsers.map((u) => u.inputTokens),
          itemStyle: { color: colors.accent },
        },
        {
          name: t("analytics.outputTokens"),
          type: "bar",
          stack: "tok",
          data: fUsers.map((u) => u.outputTokens),
          itemStyle: { color: colors.success },
        },
      ],
      _h: h,
    } as echarts.EChartsOption & { _h: number };
  }, [fUsers, colors, tip, axBase, t]);

  // ── Click handlers ───────────────────────────────

  const onModelClick = useCallback((p: echarts.ECElementEvent) => {
    const model = p.seriesName || p.name;
    if (model) setSelectedModel((prev) => (prev === model ? null : model));
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
                <EChart option={volumeOpt} height={280} onChartClick={onModelClick} />
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

              <ChartCard title={t("analytics.tokenUsageByUser")} span={2}>
                <EChart
                  option={userTokenOpt}
                  height={Math.max(220, fUsers.length * 40)}
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
