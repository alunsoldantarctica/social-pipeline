import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { contentTables } from "./schema/content";
import { adminTables } from "./schema/admin";
import { analyticsTables } from "./schema/analytics";
import { authDomainTables } from "./schema/auth";

export default defineSchema({
  ...authTables,
  ...authDomainTables,
  ...contentTables,
  ...adminTables,
  ...analyticsTables,
});
