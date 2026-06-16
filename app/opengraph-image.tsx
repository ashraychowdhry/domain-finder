import { ImageResponse } from "next/og";

export const alt = "Vocari — AI domain name generator for developers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social-share card in the Technical Workbench palette.
// Note: Satori (ImageResponse) requires display:flex on any element with >1 child.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0b0b0e",
          color: "#e8e8ec",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "#121217",
              border: "2px solid #2a2a33",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#8d70ff",
              fontSize: 52,
              fontWeight: 700,
            }}
          >
            V
          </div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>
            <span>voc</span>
            <span style={{ color: "#a78bfa" }}>ari</span>
          </div>
        </div>
        <div style={{ marginTop: 36, fontSize: 44, lineHeight: 1.25, maxWidth: 980 }}>
          The AI domain name generator that only shows you available domains.
        </div>
        <div style={{ marginTop: 28, fontSize: 26, color: "#34d399" }}>
          Brandable names · live availability · SEO &amp; brand-collision checks
        </div>
      </div>
    ),
    { ...size },
  );
}
