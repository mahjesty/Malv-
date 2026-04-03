import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="malv-app-shell">
      <div className="malv-app-bg" aria-hidden="true" />
      {children}
    </div>
  );
}

