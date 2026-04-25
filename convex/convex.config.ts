import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import stripe from "@convex-dev/stripe/convex.config.js";

const app = defineApp();
app.use(agent);
app.use(workflow);
app.use(stripe);

export default app;
