import { CheckSquare } from "lucide-react";
import type { Block } from "@/lib/store";

// Static (read-only) block renderer for the Organize reading view — the ruled
// page. Mirrors the editor's block types but renders calm, non-editable prose.

export function ReadBlock({ block, num }: { block: Block; num?: number }) {
  if (block.type === "divider")
    return (
      <div className="divider-row">
        <hr />
      </div>
    );

  const html = { dangerouslySetInnerHTML: { __html: block.text } };

  if (block.type === "bulleted")
    return (
      <div className="read-li">
        <span className="m">•</span>
        <p className="read-block" {...html} />
      </div>
    );
  if (block.type === "numbered")
    return (
      <div className="read-li">
        <span className="m num">{num}.</span>
        <p className="read-block" {...html} />
      </div>
    );
  if (block.type === "todo")
    return (
      <div className="read-li read-todo">
        <span className={`tb ${block.checked ? "on" : ""}`}>
          {block.checked && <CheckSquare size={11} color="#fff" />}
        </span>
        <p
          className="read-block"
          style={block.checked ? { color: "#A19F9D", textDecoration: "line-through" } : undefined}
          {...html}
        />
      </div>
    );
  if (block.type === "callout")
    return (
      <div className="read-callout">
        <span style={{ fontSize: 18 }}>{block.emoji || "💡"}</span>
        <p className="read-block" {...html} />
      </div>
    );
  return <p className={`read-block ${block.type}`} {...html} />;
}

export function readNumbers(blocks: Block[]): Record<string, number> {
  const map: Record<string, number> = {};
  let n = 0;
  blocks.forEach((b) => {
    if (b.type === "numbered") {
      n += 1;
      map[b.id] = n;
    } else n = 0;
  });
  return map;
}
