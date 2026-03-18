import { useState } from "react";
import JsonView from "./JsonView";
import { useTextModal } from "./TextModal";

export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: unknown;
  [key: string]: unknown;
}

export default function ResponseView({ blocks }: { blocks: ContentBlock[] }) {
  if (blocks.length === 0) {
    return <div className="empty-sm">No content blocks.</div>;
  }

  return (
    <div className="cb-list">
      {blocks.map((block, i) => (
        <ContentBlockView key={i} block={block} index={i} />
      ))}
    </div>
  );
}

function ContentBlockView({
  block,
  index,
}: {
  block: ContentBlock;
  index: number;
}) {
  switch (block.type) {
    case "thinking":
      return (
        <ThinkingBlock thinking={block.thinking ?? ""} index={index} />
      );
    case "text":
      return <TextBlock text={block.text ?? ""} />;
    case "tool_use":
      return (
        <ToolUseBlock
          name={block.name ?? "unknown"}
          toolId={block.id ?? ""}
          input={block.input}
        />
      );
    default:
      return (
        <div className="cb cb-fallback">
          <div className="cb-tag">{block.type}</div>
          <div className="cb-body">
            <JsonView data={block} />
          </div>
        </div>
      );
  }
}

function ThinkingBlock({
  thinking,
  index,
}: {
  thinking: string;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const modal = useTextModal();

  return (
    <div className="cb cb-thinking">
      <div
        className="cb-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="cb-arrow">{expanded ? "\u25BC" : "\u25B6"}</span>
        <span className="cb-tag">Thinking</span>
        {!expanded && thinking.length > 0 && (
          <span className="cb-preview">
            {thinking.slice(0, 100)}
            {thinking.length > 100 ? "..." : ""}
          </span>
        )}
      </div>
      {expanded && (
        <div className="cb-body">
          <pre className="cb-content">{thinking}</pre>
          {thinking.length > 500 && (
            <button
              className="jv-expand-btn cb-expand"
              onClick={() => modal.show(`Thinking #${index + 1}`, thinking)}
            >
              show all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  const modal = useTextModal();

  return (
    <div className="cb cb-text">
      <div className="cb-tag">Output</div>
      <div className="cb-body">
        <pre className="cb-content">{text}</pre>
        {text.length > 500 && (
          <button
            className="jv-expand-btn cb-expand"
            onClick={() => modal.show("Output", text)}
          >
            show all
          </button>
        )}
      </div>
    </div>
  );
}

function ToolUseBlock({
  name,
  toolId,
  input,
}: {
  name: string;
  toolId: string;
  input: unknown;
}) {
  return (
    <div className="cb cb-tool">
      <div className="cb-header">
        <span className="cb-tag">
          Tool: <strong>{name}</strong>
        </span>
        {toolId && <span className="cb-secondary">{toolId}</span>}
      </div>
      <div className="cb-body">
        <JsonView data={input} />
      </div>
    </div>
  );
}
