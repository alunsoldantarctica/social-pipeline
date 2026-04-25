/**
 * Firecrawl Agent Tools
 *
 * Tools for web search and content scraping using Firecrawl.
 * These wrap the existing genericScraper actions for use by agents.
 */

import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";

/**
 * Search the web for sources on a given topic
 * Uses Firecrawl's search API to find relevant URLs
 */
export const searchWeb: any = createTool({
  description: "Search the web for sources and information on a given topic. Returns URLs with titles and descriptions.",
  args: z.object({
    query: z.string().describe("The search query to find relevant sources"),
  }),
  handler: async (ctx, args) => {
    const results = await ctx.runAction(internal.admin.genericScraper.searchWeb, {
      query: args.query,
      // Keep tool schema simple for Gemini function-calling compatibility.
      limit: 5,
    });
    return JSON.stringify(results, null, 2);
  },
});

/**
 * Scrape and extract content from a URL
 * Uses Firecrawl's scrape API with a simple content extraction schema
 */
export const scrapeUrl: any = createTool({
  description: "Extract main content from a URL. Returns the page title, main content text, and key points.",
  args: z.object({
    url: z.string().describe("The URL to scrape and extract content from"),
  }),
  handler: async (ctx, args) => {
    // Simple content extraction schema
    const contentSchema = JSON.stringify({
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The page or article title",
        },
        mainContent: {
          type: "string",
          description: "The main body content of the page",
        },
        keyPoints: {
          type: "array",
          items: { type: "string" },
          description: "Key points or takeaways from the content",
        },
        publishDate: {
          type: "string",
          description: "Publication date if available",
        },
      },
      required: ["title", "mainContent"],
    });

    const result: any = await ctx.runAction(internal.admin.genericScraper.scrapeWithSchema, {
      url: args.url,
      schemaJson: contentSchema,
      extractionPrompt: "Extract the main article content, title, key points, and publication date from this page. Focus on the primary content, ignoring navigation, ads, and sidebars.",
    });

    return JSON.stringify(result, null, 2);
  },
});
