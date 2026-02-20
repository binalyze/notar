import { type ShallowRef, readonly, shallowRef } from "vue";

export interface BrandConfig {
  company: {
    name: string;
    website: string;
    logo: {
      dark: string;
      light: string;
    };
    social: {
      linkedin?: string;
      twitter?: string;
    };
    links: Array<{ label: string; url: string }>;
  };
  product: {
    tagline: string;
    github: string;
    npm: string;
  };
  preloader: {
    logo: {
      dark: string;
      light: string;
    };
  };
  og: {
    title: string;
    description: string;
    hero: string;
  };
}

const DEFAULTS: BrandConfig = {
  company: {
    name: "Binalyze",
    website: "https://www.binalyze.com",
    logo: {
      dark: "/branding/company-logo-dark.svg",
      light: "/branding/company-logo-light.svg",
    },
    social: {
      linkedin: "https://www.linkedin.com/company/binalyze",
      twitter: "https://x.com/binalyze",
    },
    links: [
      { label: "Website", url: "https://www.binalyze.com" },
      { label: "Binalyze AIR", url: "https://www.binalyze.com/air" },
    ],
  },
  product: {
    tagline: "Open-source file signing & verification.",
    github: "https://github.com/binalyze/notar",
    npm: "@binalyze/notar",
  },
  preloader: {
    logo: {
      dark: "/branding/preloader-dark.svg",
      light: "/branding/preloader-light.svg",
    },
  },
  og: {
    title: "Notar - Trust-First AI",
    description: "Free, open-source Ed25519 file signing and verification.",
    hero: "Sign and Verify with confidence",
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source as Record<string, unknown>)) {
    const srcVal = (source as Record<string, unknown>)[key];
    const tgtVal = result[key];
    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }
  return result as T;
}

const config = shallowRef<BrandConfig>(DEFAULTS);

export async function loadConfig(): Promise<void> {
  try {
    const res = await fetch("/config.json");
    if (!res.ok) return;
    const partial = (await res.json()) as Partial<BrandConfig>;
    config.value = deepMerge(DEFAULTS, partial);
  } catch {
    // Missing or invalid config — use defaults
  }
}

export function useConfig() {
  return readonly(config) as Readonly<ShallowRef<BrandConfig>>;
}
