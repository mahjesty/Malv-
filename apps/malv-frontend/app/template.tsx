"use client";

import { useEffect } from "react";
import { ensureMalvRuntimeConnection } from "@/lib/malv-runtime";

/**
 * Wraps all pages without editing `layout.tsx` or `page.tsx` from the design package.
 * Establishes Socket.IO to the MALV API when the app loads.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensureMalvRuntimeConnection();
  }, []);

  return <>{children}</>;
}
