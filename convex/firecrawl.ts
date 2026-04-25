import { action } from "./_generated/server";
import { v } from "convex/values";

// Firecrawl API base URL
const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";

/**
 * Search for credit card URLs using Firecrawl's search API.
 * Returns a list of potential official card pages.
 */
export const searchCardUrl = action({
  args: {
    cardName: v.string(),
    bank: v.optional(v.string()),
  },
  handler: async (_ctx, { cardName, bank }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error("FIRECRAWL_API_KEY environment variable not set");
    }

    // Build search query for official card page
    const searchTerms = bank 
      ? `${bank} ${cardName} credit card official benefits travel insurance`
      : `${cardName} credit card official benefits travel insurance`;

    const response = await fetch(`${FIRECRAWL_BASE_URL}/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchTerms,
        limit: 5,
        lang: "en",
        country: "us",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firecrawl search failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Return structured results
    return (data.data || []).map((result: { url: string; title?: string; description?: string }) => ({
      url: result.url,
      title: result.title || "Unknown",
      description: result.description || "",
    }));
  },
});

/**
 * Scrape credit card data from a given URL using Firecrawl's extraction API.
 * Returns structured travel insurance coverage data.
 */
export const scrapeCardData = action({
  args: {
    url: v.string(),
  },
  handler: async (_ctx, { url }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error("FIRECRAWL_API_KEY environment variable not set");
    }

    // Schema for extracting credit card travel insurance data
    const extractionSchema = {
      type: "object",
      properties: {
        cardName: { 
          type: "string",
          description: "The full official name of the credit card"
        },
        issuingBank: {
          type: "string",
          description: "The bank or financial institution that issues this card"
        },
        annualFee: {
          type: "number",
          description: "The annual fee for the card in USD (0 if no annual fee)"
        },
        emergencyEvacuationCoverage: { 
          type: "number",
          description: "Emergency evacuation/medical evacuation coverage limit in USD"
        },
        tripCancellationCoverage: { 
          type: "number",
          description: "Trip cancellation/interruption coverage limit in USD"
        },
        tripDelayCoverage: { 
          type: "number",
          description: "Trip delay coverage limit in USD"
        },
        baggageCoverage: { 
          type: "number",
          description: "Lost/delayed baggage coverage limit in USD"
        },
        rentalCarPrimaryCoverage: { 
          type: "boolean",
          description: "Whether rental car coverage is primary (true) or secondary (false)"
        },
        cardImageUrl: {
          type: "string",
          description: "URL to an image of the credit card"
        },
        cardBrand: {
          type: "string",
          enum: ["visa", "mastercard", "amex", "discover", "other"],
          description: "The card network brand"
        },
        travelBenefitsSummary: {
          type: "string",
          description: "Brief summary of all travel-related benefits"
        }
      },
      required: ["cardName"]
    };

    const response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["extract"],
        extract: {
          schema: extractionSchema,
          prompt: "Extract credit card travel insurance benefits and coverage amounts in USD. Focus on: emergency medical evacuation coverage, trip cancellation/interruption coverage, trip delay coverage, baggage loss/delay coverage, and rental car coverage. If a coverage is not mentioned or unavailable, leave it empty (don't guess)."
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firecrawl scrape failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const extracted = data.data?.extract || {};

    // Map extracted data to our schema format
    return {
      name: extracted.cardName || "Unknown Card",
      issuingBank: extracted.issuingBank || null,
      brand: extracted.cardBrand || null,
      image: extracted.cardImageUrl || null,
      evacCoverage: extracted.emergencyEvacuationCoverage || null,
      tripCancellation: extracted.tripCancellationCoverage || null,
      tripDelay: extracted.tripDelayCoverage || null,
      baggage: extracted.baggageCoverage || null,
      rentalCarPrimary: extracted.rentalCarPrimaryCoverage ?? null,
      annualFee: extracted.annualFee || null,
      travelBenefitsSummary: extracted.travelBenefitsSummary || null,
      sourceUrl: url,
      rawExtraction: extracted, // Include raw data for debugging
    };
  },
});
