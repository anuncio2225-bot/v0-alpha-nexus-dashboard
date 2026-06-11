"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface HideValuesContextType {
  hidden: boolean;
  toggle: () => void;
}

const HideValuesContext = createContext<HideValuesContextType>({
  hidden: false,
  toggle: () => {},
});

export function HideValuesProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("alphanexus-hide-values");
    if (stored === "true") setHidden(true);
    setHydrated(true);
  }, []);

  function toggle() {
    setHidden((prev) => {
      const next = !prev;
      localStorage.setItem("alphanexus-hide-values", String(next));
      return next;
    });
  }

  if (!hydrated) return null;

  return (
    <HideValuesContext.Provider value={{ hidden, toggle }}>
      {children}
    </HideValuesContext.Provider>
  );
}

export function useHideValues() {
  return useContext(HideValuesContext);
}
