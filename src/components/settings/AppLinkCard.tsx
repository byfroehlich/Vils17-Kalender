"use client";

import { useState } from "react";
import { Copy, Check, Link } from "lucide-react";

export function AppLinkCard({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 16,
      padding: "14px 18px",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <Link style={{ width: 16, height: 16, color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>App-Link</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</p>
      </div>
      <button
        onClick={copy}
        style={{
          background: copied ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.08)",
          border: `1px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 8,
          padding: "6px 10px",
          color: copied ? "#6ee7b7" : "rgba(255,255,255,0.6)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
          transition: "all 0.15s",
        }}
      >
        {copied
          ? <><Check style={{ width: 13, height: 13 }} />Kopiert</>
          : <><Copy style={{ width: 13, height: 13 }} />Kopieren</>
        }
      </button>
    </div>
  );
}
