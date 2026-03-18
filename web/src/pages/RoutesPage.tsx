import { useState, useEffect, useCallback } from "react";
import { Header } from "../App";
import type { ModelRoute } from "../types";

interface Props {
  view: "monitor" | "routes";
  onViewChange: (v: "monitor" | "routes") => void;
}

const EMPTY_ROUTE: ModelRoute = {
  input_model: "",
  upstream_url: "",
  output_model: "",
  api_key: "",
};

export default function RoutesPage({ view, onViewChange }: Props) {
  const [routes, setRoutes] = useState<ModelRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<ModelRoute>(EMPTY_ROUTE);
  const [saving, setSaving] = useState(false);

  const fetchRoutes = useCallback(async () => {
    try {
      const res = await fetch("/api/routes");
      const data = await res.json();
      setRoutes(data.routes ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  const saveRoutes = async (next: ModelRoute[]) => {
    setSaving(true);
    try {
      await fetch("/api/routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routes: next }),
      });
      setRoutes(next);
      setEditing(null);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (index: number) => {
    setEditing(index);
    setDraft({ ...routes[index] });
  };

  const startAdd = () => {
    setEditing("new");
    setDraft({ ...EMPTY_ROUTE });
  };

  const cancel = () => setEditing(null);

  const save = () => {
    if (!draft.input_model || !draft.upstream_url || !draft.output_model) return;
    const cleaned = { ...draft };
    if (!cleaned.api_key) delete cleaned.api_key;

    if (editing === "new") {
      saveRoutes([...routes, cleaned]);
    } else if (typeof editing === "number") {
      const next = [...routes];
      next[editing] = cleaned;
      saveRoutes(next);
    }
  };

  const remove = (index: number) => {
    saveRoutes(routes.filter((_, i) => i !== index));
  };

  return (
    <div className="app">
      <Header view={view} onViewChange={onViewChange} />

      <div className="routes-page">
        <div className="routes-header">
          <h2>Model Routes</h2>
          <button
            className="btn-primary"
            onClick={startAdd}
            disabled={editing !== null}
          >
            + Add Route
          </button>
        </div>

        {loading ? (
          <div className="empty">Loading...</div>
        ) : (
          <table className="routes-table">
            <thead>
              <tr>
                <th>Input Model</th>
                <th>Output Model</th>
                <th>Upstream URL</th>
                <th>API Key</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route, i) =>
                editing === i ? (
                  <EditRow
                    key={i}
                    draft={draft}
                    onChange={setDraft}
                    onSave={save}
                    onCancel={cancel}
                    saving={saving}
                  />
                ) : (
                  <tr key={i}>
                    <td className="cell-mono">{route.input_model}</td>
                    <td className="cell-mono">{route.output_model}</td>
                    <td className="cell-mono cell-url">{route.upstream_url}</td>
                    <td className="cell-mono">
                      {route.api_key ? "****" : "-"}
                    </td>
                    <td className="cell-actions">
                      <button
                        className="btn-sm"
                        onClick={() => startEdit(i)}
                        disabled={editing !== null}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => remove(i)}
                        disabled={editing !== null}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {editing === "new" && (
                <EditRow
                  draft={draft}
                  onChange={setDraft}
                  onSave={save}
                  onCancel={cancel}
                  saving={saving}
                />
              )}
              {routes.length === 0 && editing === null && (
                <tr>
                  <td colSpan={5} className="empty-sm">
                    No routes configured. All requests go to the default
                    upstream.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EditRow({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  draft: ModelRoute;
  onChange: (r: ModelRoute) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set = (field: keyof ModelRoute, value: string) =>
    onChange({ ...draft, [field]: value });

  return (
    <tr className="edit-row">
      <td>
        <input
          className="input"
          placeholder="claude-3-opus"
          value={draft.input_model}
          onChange={(e) => set("input_model", e.target.value)}
        />
      </td>
      <td>
        <input
          className="input"
          placeholder="glm-4-plus"
          value={draft.output_model}
          onChange={(e) => set("output_model", e.target.value)}
        />
      </td>
      <td>
        <input
          className="input"
          placeholder="https://api.example.com"
          value={draft.upstream_url}
          onChange={(e) => set("upstream_url", e.target.value)}
        />
      </td>
      <td>
        <input
          className="input"
          type="password"
          placeholder="optional"
          value={draft.api_key ?? ""}
          onChange={(e) => set("api_key", e.target.value)}
        />
      </td>
      <td className="cell-actions">
        <button className="btn-sm btn-save" onClick={onSave} disabled={saving}>
          Save
        </button>
        <button className="btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}
