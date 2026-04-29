import { useState, useEffect, useCallback } from "react";

export function useTabParam(defaultTab: string, validKeys: string[]): [string, (tab: string) => void] {
  function readTab(): string {
    if (typeof window === "undefined") return defaultTab;
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    return t && validKeys.includes(t) ? t : defaultTab;
  }

  const [activeTab, setActiveTabState] = useState<string>(readTab);

  useEffect(() => {
    setActiveTabState(readTab());
  }, []);

  const setActiveTab = useCallback((tab: string) => {
    if (!validKeys.includes(tab)) return;
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }, [validKeys]);

  return [activeTab, setActiveTab];
}
