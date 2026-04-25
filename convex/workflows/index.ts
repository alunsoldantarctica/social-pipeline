/**
 * Workflow Manager
 *
 * Initializes the WorkflowManager singleton for orchestrating durable workflows.
 * Used by the content pipeline to coordinate agent execution with human approval gates.
 */

import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "../_generated/api";

// Create the WorkflowManager singleton
// This is used to define and start workflows throughout the application
export const workflowManager = new WorkflowManager(components.workflow);
