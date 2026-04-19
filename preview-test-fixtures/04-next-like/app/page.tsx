export default function Page() {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        fontFamily: "ui-monospace, monospace",
        background: "#111",
        color: "#0f0",
      }}
    >
      <h1 style={{ marginTop: 0 }}>Next-like app/page.tsx</h1>
      <p style={{ margin: 0, opacity: 0.9 }}>
        Path matches MALV Next route detection (<code>app/page.tsx</code>).
      </p>
    </div>
  );
}
