import { internalAction } from "../_generated/server";
import { v } from "convex/values";

// Firecrawl API base URL
const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";

/**
 * Type definition for extraction schema property
 */
export interface ExtractionSchemaProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: { type: string };
}

/**
 * Type definition for the full extraction schema
 */
export interface ExtractionSchema {
  type: "object";
  properties: Record<string, ExtractionSchemaProperty>;
  required: string[];
}

/**
 * Search result from Firecrawl
 */
export interface SearchResult {
  url: string;
  title: string;
  description: string;
}

/**
 * Generic search function for Firecrawl
 */
export async function genericSearch(
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY environment variable not set");
  }

  const response = await fetch(`${FIRECRAWL_BASE_URL}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit,
      lang: "en",
      country: "us",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl search failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return (data.data || []).map(
    (result: { url: string; title?: string; description?: string }) => ({
      url: result.url,
      title: result.title || "Unknown",
      description: result.description || "",
    })
  );
}

/**
 * Generic scrape function for Firecrawl with configurable schema
 */
export async function genericScrape<T extends Record<string, unknown>>(
  url: string,
  schema: ExtractionSchema,
  extractionPrompt: string
): Promise<T & { sourceUrl: string; rawExtraction: Record<string, unknown> }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY environment variable not set");
  }

  const response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["extract"],
      extract: {
        schema,
        prompt: extractionPrompt,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl scrape failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const extracted = data.data?.extract || {};

  return {
    ...extracted,
    sourceUrl: url,
    rawExtraction: extracted,
  } as T & { sourceUrl: string; rawExtraction: Record<string, unknown> };
}

/**
 * Convex action for generic web search
 */
export const searchWeb = internalAction({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, { query, limit }) => {
    return genericSearch(query, limit);
  },
});

/**
 * Convex action for generic scraping with dynamic schema
 * The schema and prompt are passed as JSON strings for flexibility
 */
export const scrapeWithSchema = internalAction({
  args: {
    url: v.string(),
    schemaJson: v.string(), // JSON string of ExtractionSchema
    extractionPrompt: v.string(),
  },
  handler: async (_ctx, { url, schemaJson, extractionPrompt }) => {
    const schema = JSON.parse(schemaJson) as ExtractionSchema;
    return genericScrape(url, schema, extractionPrompt);
  },
});

// ============================================
// Pre-defined schemas for common entity types
// ============================================

/**
 * Insurance Plan extraction schema
 */
export const INSURANCE_PLAN_SCHEMA: ExtractionSchema = {
  type: "object",
  properties: {
    planName: {
      type: "string",
      description: "The official name of the insurance plan/product",
    },
    carrierName: {
      type: "string",
      description: "The insurance company or underwriter name",
    },
    planTier: {
      type: "string",
      enum: ["basic", "standard", "premium"],
      description:
        "The tier/level of the plan based on coverage amounts (basic=low, standard=mid, premium=high)",
    },
    emergencyEvacuationCoverage: {
      type: "number",
      description:
        "Emergency medical evacuation coverage limit in USD (the main evac coverage amount)",
    },
    tripCancellationCoverage: {
      type: "number",
      description:
        "Trip cancellation/interruption coverage limit in USD (maximum reimbursement)",
    },
    tripDelayCoverage: {
      type: "number",
      description:
        "Trip delay coverage limit in USD per person (for accommodation/meals due to delay)",
    },
    baggageCoverage: {
      type: "number",
      description: "Lost/delayed baggage coverage limit in USD per person",
    },
    medicalExpenseCoverage: {
      type: "number",
      description: "Medical expense/emergency medical coverage limit in USD",
    },
    basePrice: {
      type: "number",
      description: "Starting price or base premium for the plan in USD (if available)",
    },
    features: {
      type: "array",
      items: { type: "string" },
      description:
        "List of key features/benefits included in the plan (e.g., '24/7 assistance', 'Adventure sports coverage')",
    },
    countriesCovered: {
      type: "array",
      items: { type: "string" },
      description:
        "List of countries or regions covered by this plan (e.g., 'Antarctica', 'Worldwide')",
    },
    eligibleNationalities: {
      type: "array",
      items: { type: "string" },
      description:
        "List of nationalities eligible for this plan (country codes like 'US', 'GB', or 'ALL' for all)",
    },
    excludedNationalities: {
      type: "array",
      items: { type: "string" },
      description: "List of nationalities excluded from this plan (country codes)",
    },
    planDescription: {
      type: "string",
      description: "Brief marketing description or summary of the plan (1-2 sentences)",
    },
    documentationUrl: {
      type: "string",
      description: "URL to plan brochure or marketing materials",
    },
    policyTermsUrl: {
      type: "string",
      description: "URL to the full policy terms/wording PDF document",
    },
  },
  required: ["planName"],
};

export const INSURANCE_PLAN_PROMPT = `Extract travel insurance plan details from this page. Focus on:
- Coverage limits in USD for: emergency evacuation, trip cancellation, trip delay, baggage, medical expenses
- Plan tier based on coverage (basic/standard/premium)
- Key features and benefits
- Countries and regions covered
- Eligibility restrictions by nationality
- Links to policy documents

If a value is not found or unclear, leave it empty (don't guess). 
For coverage amounts, extract the maximum/primary limit, not per-incident limits.
For evacuation coverage, look for terms like "emergency evacuation", "medical evacuation", "repatriation".`;

/**
 * Operator extraction schema (for tour operators)
 */
export const OPERATOR_SCHEMA: ExtractionSchema = {
  type: "object",
  properties: {
    operatorName: {
      type: "string",
      description: "The official name of the tour operator/expedition company",
    },
    minimumEvacCoverage: {
      type: "number",
      description:
        "The minimum emergency evacuation insurance coverage required by this operator in USD",
    },
    website: {
      type: "string",
      description: "The official website URL of the operator",
    },
    operatingRegions: {
      type: "array",
      items: { type: "string" },
      description:
        "Regions/destinations where this operator runs expeditions (e.g., 'Antarctica', 'Arctic', 'Svalbard')",
    },
    insuranceRequirements: {
      type: "string",
      description:
        "Description of the operator's travel insurance requirements and policies",
    },
  },
  required: ["operatorName"],
};

export const OPERATOR_PROMPT = `Extract tour operator information from this page. Focus on:
- Official company name
- Minimum evacuation insurance coverage required (in USD)
- Operating regions and destinations
- Insurance requirements and recommendations

If a value is not found or unclear, leave it empty (don't guess).
Look for terms like "insurance requirements", "evacuation coverage", "minimum coverage".`;

/**
 * Carrier extraction schema (for insurance carriers)
 */
export const CARRIER_SCHEMA: ExtractionSchema = {
  type: "object",
  properties: {
    carrierName: {
      type: "string",
      description: "The official name of the insurance carrier/underwriter",
    },
    shortName: {
      type: "string",
      description: "Short/abbreviated name commonly used",
    },
    amBestRating: {
      type: "string",
      description: "AM Best financial strength rating (e.g., 'A+', 'A-', 'B++')",
    },
    website: {
      type: "string",
      description: "The official website URL",
    },
    description: {
      type: "string",
      description: "Brief description of the carrier and their specialty",
    },
    logoUrl: {
      type: "string",
      description: "URL to the carrier's logo image",
    },
  },
  required: ["carrierName"],
};

export const CARRIER_PROMPT = `Extract insurance carrier/company information from this page. Focus on:
- Official company name and short name
- AM Best rating (financial strength rating)
- Company description and specialty
- Logo and website

If a value is not found or unclear, leave it empty (don't guess).
Look for terms like "AM Best rating", "financial strength", "underwriter".`;

/**
 * Destination extraction schema
 */
export const DESTINATION_SCHEMA: ExtractionSchema = {
  type: "object",
  properties: {
    destinationName: {
      type: "string",
      description: "The name of the destination (e.g., 'Antarctica', 'Svalbard')",
    },
    countryCode: {
      type: "string",
      description: "ISO 3166-1 alpha-2 country code (e.g., 'AQ' for Antarctica)",
    },
    tagline: {
      type: "string",
      description: "Short marketing tagline for the destination",
    },
    description: {
      type: "string",
      description: "Detailed description of the destination and travel experience",
    },
    requirements: {
      type: "array",
      items: { type: "string" },
      description:
        "List of travel requirements (e.g., 'Valid passport', 'Travel insurance mandatory')",
    },
    minimumEvacCoverage: {
      type: "number",
      description:
        "Recommended minimum evacuation coverage in USD for this destination",
    },
    imageUrl: {
      type: "string",
      description: "URL to a representative image of the destination",
    },
  },
  required: ["destinationName"],
};

export const DESTINATION_PROMPT = `Extract travel destination information from this page. Focus on:
- Destination name and country code
- Marketing description and tagline
- Travel requirements and restrictions
- Recommended insurance coverage amounts
- Representative images

If a value is not found or unclear, leave it empty (don't guess).`;
