import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Safety net: publish any blog posts whose scheduled time has passed
crons.daily(
  "publish missed blog posts",
  { hourUTC: 0, minuteUTC: 5 },
  internal.blogPosts._publishMissedPosts
);

// Sync OpenRouter model catalog daily @ 03:00 UTC (eligible-only + family dedup)
crons.daily(
  "sync model catalog",
  { hourUTC: 3, minuteUTC: 0 },
  internal.catalog.sync.syncModelCatalog
);

export default crons;
