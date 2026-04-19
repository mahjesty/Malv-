/** Single-file upload only: pairing index.html makes MALV treat the set as a static HTML bundle. */
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        fontFamily: "system-ui, sans-serif",
        background: "#0f172a",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "2rem",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.25rem" }}>React TSX preview</h1>
      <p style={{ margin: 0, color: "#94a3b8" }}>Count: {count}</p>
      <button
        type="button"
        onClick={() => setCount((c) => c + 1)}
        style={{
          font: "inherit",
          padding: "0.5rem 1rem",
          borderRadius: "6px",
          border: "1px solid #38bdf8",
          background: "#0284c7",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Increment
      </button>
    </main>
  );
}
