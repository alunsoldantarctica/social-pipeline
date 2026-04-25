/// <reference path="../.astro/types.d.ts" />

// WebMCP (Chrome 146+) — navigator.modelContext type augmentation
import type { ModelContextAPI } from "./lib/webmcp/types";
declare global {
  interface Navigator {
    modelContext?: ModelContextAPI;
  }
}

/**
 * Session data stored in Cloudflare KV via Astro Sessions.
 * This provides type safety when accessing session data in middleware
 * and server-rendered pages.
 */
declare namespace App {
  interface Locals {
    locale: import('./i18n/types').Locale;
  }
  interface SessionData {
    /** Anonymous session identifier (UUID) - persists across page loads */
    visitorId: string;
    
    /** Multi-step quote wizard progress */
    quoteProgress?: {
      step: number;
      data: {
        destination?: string;
        startDate?: string;
        durationDays?: number;
        tripCost?: number;
        travelers?: number;
        travelerAges?: number[];
        residence?: string;
        operator?: string;
        name?: string;
        email?: string;
        phone?: string;
      };
    };
    
    /** Multi-step coverage analyzer progress */
    coverageProgress?: {
      step: number;
      data: {
        tripType?: string;
        creditCard?: string;
        purchaseDate?: string;
        tripCostRange?: string;
        email?: string;
      };
    };
    
    /** Timestamp of last coverage check (ISO string) */
    lastCoverageCheck?: string;
    
    /** Visitor geolocation from Cloudflare */
    visitorCity?: string;
    visitorCountry?: string;
    visitorRegion?: string;

    /** User preferences */
    preferences?: {
      dismissedModals?: string[];
    };
  }
}
