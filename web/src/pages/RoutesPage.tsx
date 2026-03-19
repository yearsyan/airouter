import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Header } from "../App";
import type { Provider, DefaultModel, ModelRoute } from "../types";

/* ── Custom Dropdown ─────────────────────────────────── */

function Dropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`dropdown ${open ? "dropdown-open" : ""}`} ref={ref}>
      <button
        className="dropdown-trigger"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="dropdown-value">{selected?.label ?? value}</span>
        <svg className="dropdown-arrow" width="12" height="12" viewBox="0 0 12 12">
          <path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="dropdown-menu">
          {options.map((o) => (
            <button
              key={o.value}
              className={`dropdown-item ${o.value === value ? "dropdown-item-active" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              type="button"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────── */

export default function RoutesPage() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [routes, setRoutes] = useState<ModelRoute[]>([]);
  const [defaultModel, setDefaultModel] = useState<DefaultModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Runtime default model editing
  const [editProvider, setEditProvider] = useState("");
  const [editModel, setEditModel] = useState("");
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const fetchRoutes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/routes");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProviders(data.providers ?? []);
      setRoutes(data.routes ?? []);
      setDefaultModel(data.default_model ?? null);
      setError(null);
    } catch (e) {
      setError(`Failed to load config: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  // Sync edit fields when defaultModel loads
  useEffect(() => {
    if (defaultModel) {
      setEditProvider(defaultModel.provider);
      setEditModel(defaultModel.model);
    } else if (providers.length > 0) {
      setEditProvider(providers[0].name);
      setEditModel(providers[0].models[0] ?? "");
    }
  }, [defaultModel, providers]);

  // Models for the selected edit provider
  const editProviderModels = useMemo(() => {
    const p = providers.find((p) => p.name === editProvider);
    return p?.models ?? [];
  }, [providers, editProvider]);

  const handleProviderChange = (name: string) => {
    setEditProvider(name);
    setApplied(false);
    const p = providers.find((p) => p.name === name);
    setEditModel(p?.models[0] ?? "");
  };

  const handleApply = async () => {
    try {
      setApplying(true);
      const res = await fetch("/api/default-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: editProvider, model: editModel }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDefaultModel(data.default_model);
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    } catch (e) {
      setError(`Failed to update default model: ${e}`);
    } finally {
      setApplying(false);
    }
  };

  const isChanged =
    defaultModel?.provider !== editProvider ||
    defaultModel?.model !== editModel;

  const providerOptions = providers.map((p) => ({
    value: p.name,
    label: p.name,
  }));

  const modelOptions = editProviderModels.map((m) => ({
    value: m,
    label: m,
  }));

  return (
    <div className="app">
      <Header />

      <div className="routes-page">
        <div className="routes-header">
          <h2>{t("routes.title")}</h2>
          <span className="routes-readonly">{t("routes.readonly")}</span>
        </div>

        {error && <div className="routes-error">{error}</div>}

        {loading ? (
          <div className="empty">{t("common.loading")}</div>
        ) : (
          <>
            {/* Providers */}
            <section className="config-section">
              <h3>{t("routes.providers")}</h3>
              {providers.length === 0 ? (
                <div className="empty-sm">{t("routes.noProviders")}</div>
              ) : (
                <table className="routes-table">
                  <thead>
                    <tr>
                      <th>{t("routes.providerName")}</th>
                      <th>{t("routes.upstreamUrl")}</th>
                      <th>{t("routes.apiKey")}</th>
                      <th>{t("routes.auth")}</th>
                      <th>{t("routes.models")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p) => (
                      <tr key={p.name}>
                        <td className="cell-mono">{p.name}</td>
                        <td className="cell-mono cell-url">{p.upstream_url}</td>
                        <td className="cell-mono">
                          {p.has_api_key ? "****" : "-"}
                        </td>
                        <td className="cell-mono">{p.auth_header}</td>
                        <td className="cell-mono">
                          {p.models.length > 0 ? p.models.join(", ") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Default Model */}
            {providers.length > 0 && (
              <section className="config-section">
                <h3>{t("routes.defaultModel")}</h3>
                <div className="default-model-form">
                  <div className="default-model-fields">
                    <Dropdown
                      value={editProvider}
                      options={providerOptions}
                      onChange={handleProviderChange}
                    />

                    {modelOptions.length > 0 ? (
                      <Dropdown
                        value={editModel}
                        options={modelOptions}
                        onChange={(v) => {
                          setEditModel(v);
                          setApplied(false);
                        }}
                      />
                    ) : (
                      <input
                        type="text"
                        className="dropdown-input"
                        value={editModel}
                        onChange={(e) => {
                          setEditModel(e.target.value);
                          setApplied(false);
                        }}
                        placeholder="model name"
                      />
                    )}

                    <button
                      className="btn-apply"
                      onClick={handleApply}
                      disabled={applying || !isChanged || !editModel}
                    >
                      {applied ? t("routes.applied") : t("routes.apply")}
                    </button>
                  </div>
                  <span className="default-model-hint">
                    {t("routes.runtimeOnly")}
                  </span>
                </div>
              </section>
            )}

            {/* Routes */}
            <section className="config-section">
              <h3>{t("routes.routeRules")}</h3>
              {routes.length === 0 ? (
                <div className="empty-sm">{t("routes.noRoutes")}</div>
              ) : (
                <table className="routes-table">
                  <thead>
                    <tr>
                      <th>{t("routes.inputModel")}</th>
                      <th>{t("routes.providerName")}</th>
                      <th>{t("routes.outputModel")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((r, i) => (
                      <tr key={i}>
                        <td className="cell-mono">{r.input_model}</td>
                        <td className="cell-mono">{r.provider}</td>
                        <td className="cell-mono">{r.model}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
