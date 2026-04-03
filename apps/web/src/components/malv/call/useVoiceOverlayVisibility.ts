import { useCallback, useEffect, useState } from "react";

/**
 * Immersive chrome visibility: tap empty space toggles; reset when session phase changes.
 */
export function useVoiceOverlayVisibility(opts: { phaseKey: string }) {
  const [chromeVisible, setChromeVisible] = useState(true);

  useEffect(() => {
    setChromeVisible(true);
  }, [opts.phaseKey]);

  const showChrome = useCallback(() => setChromeVisible(true), []);
  const toggleChrome = useCallback(() => setChromeVisible((v) => !v), []);

  return { chromeVisible, showChrome, toggleChrome };
}
