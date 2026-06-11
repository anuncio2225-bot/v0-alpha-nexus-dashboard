"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "alphanexus-sidebar-collapsed";

export function useSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setIsCollapsed(stored === "true");
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage when state changes
  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const collapse = useCallback(() => {
    setIsCollapsed(true);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const expand = useCallback(() => {
    setIsCollapsed(false);
    localStorage.setItem(STORAGE_KEY, "false");
  }, []);

  return {
    isCollapsed,
    isHydrated,
    toggle,
    collapse,
    expand,
  };
}
