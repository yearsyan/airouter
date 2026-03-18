import { useState } from "react";
import { useTextModal } from "./TextModal";

const MAX_STR = 300;

export default function JsonView({ data }: { data: unknown }) {
  return (
    <div className="jv">
      <JsonNode value={data} depth={0} />
    </div>
  );
}

function JsonNode({
  value,
  depth,
  keyName,
  isLast = true,
}: {
  value: unknown;
  depth: number;
  keyName?: string;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const modal = useTextModal();
  const comma = isLast ? "" : ",";

  const prefix =
    keyName !== undefined ? (
      <>
        <span className="jv-key">{`"${keyName}"`}</span>
        <span className="jv-punct">{": "}</span>
      </>
    ) : null;

  // null / undefined
  if (value === null || value === undefined) {
    return (
      <div className="jv-line">
        {prefix}
        <span className="jv-null">null</span>
        {comma}
      </div>
    );
  }

  // string
  if (typeof value === "string") {
    const truncated = value.length > MAX_STR;
    const display = truncated ? value.slice(0, MAX_STR) + "..." : value;
    return (
      <div className="jv-line">
        {prefix}
        <span className="jv-str">{`"${display}"`}</span>
        {truncated && (
          <button
            className="jv-expand-btn"
            onClick={() =>
              modal.show(keyName ? `"${keyName}"` : "String", value)
            }
          >
            show all
          </button>
        )}
        {comma}
      </div>
    );
  }

  // number
  if (typeof value === "number") {
    return (
      <div className="jv-line">
        {prefix}
        <span className="jv-num">{value}</span>
        {comma}
      </div>
    );
  }

  // boolean
  if (typeof value === "boolean") {
    return (
      <div className="jv-line">
        {prefix}
        <span className="jv-bool">{String(value)}</span>
        {comma}
      </div>
    );
  }

  // array
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="jv-line">
          {prefix}
          <span className="jv-punct">{"[]"}</span>
          {comma}
        </div>
      );
    }

    return (
      <div className="jv-node">
        <div
          className="jv-line jv-toggle-line"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="jv-arrow">{expanded ? "\u25BC" : "\u25B6"}</span>
          {prefix}
          <span className="jv-punct">{"["}</span>
          {!expanded && (
            <>
              <span className="jv-preview">{value.length} items</span>
              <span className="jv-punct">{"]"}</span>
            </>
          )}
          {!expanded && comma}
        </div>
        {expanded && (
          <div className="jv-children">
            {value.map((item, i) => (
              <JsonNode
                key={i}
                value={item}
                depth={depth + 1}
                isLast={i === value.length - 1}
              />
            ))}
          </div>
        )}
        {expanded && (
          <div className="jv-line">
            <span className="jv-punct">{"]"}</span>
            {comma}
          </div>
        )}
      </div>
    );
  }

  // object
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <div className="jv-line">
          {prefix}
          <span className="jv-punct">{"{}"}</span>
          {comma}
        </div>
      );
    }

    return (
      <div className="jv-node">
        <div
          className="jv-line jv-toggle-line"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="jv-arrow">{expanded ? "\u25BC" : "\u25B6"}</span>
          {prefix}
          <span className="jv-punct">{"{"}</span>
          {!expanded && (
            <>
              <span className="jv-preview">
                {entries.length} {entries.length === 1 ? "key" : "keys"}
              </span>
              <span className="jv-punct">{"}"}</span>
            </>
          )}
          {!expanded && comma}
        </div>
        {expanded && (
          <div className="jv-children">
            {entries.map(([k, v], i) => (
              <JsonNode
                key={k}
                keyName={k}
                value={v}
                depth={depth + 1}
                isLast={i === entries.length - 1}
              />
            ))}
          </div>
        )}
        {expanded && (
          <div className="jv-line">
            <span className="jv-punct">{"}"}</span>
            {comma}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="jv-line">
      {prefix}
      {String(value)}
      {comma}
    </div>
  );
}
