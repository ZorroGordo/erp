import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { brand as defaults } from '../config/brand';

/** Fields the user can override in the Settings page */
export interface BrandOverrides {
  name: string;
  fullName: string;
  tagline: string;
  logoEmoji: string;
}

interface BrandContextValue {
  brand: BrandOverrides;
  updateBrand: (overrides: Partial<BrandOverrides>) => void;
  resetBrand: () => void;
}

const STORAGE_KEY = 'victoros_brand_overrides';

function loadFromStorage(): BrandOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultValues(), ...JSON.parse(raw) };
  } catch {}
  return defaultValues();
}

function defaultValues(): BrandOverrides {
  return {
    name:       defaults.name,
    fullName:   defaults.fullName,
    tagline:    defaults.tagline,
    logoEmoji:  defaults.logoEmoji,
  };
}

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrandState] = useState<BrandOverrides>(loadFromStorage);

  const updateBrand = useCallback((overrides: Partial<BrandOverrides>) => {
    setBrandState(prev => {
      const next = { ...prev, ...overrides };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetBrand = useCallback(() => {
    const fresh = defaultValues();
    localStorage.removeItem(STORAGE_KEY);
    setBrandState(fresh);
  }, []);

  return (
    <BrandContext.Provider value={{ brand, updateBrand, resetBrand }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used inside BrandProvider');
  return ctx;
}
