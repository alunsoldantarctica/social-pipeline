/**
 * Convex Agent Configuration
 *
 * Models are now configured in the database (agentConfigs table).
 * This file only re-exports the components needed by agents.
 *
 * To change models, update the agentConfigs table via:
 * - Admin panel
 * - agents/config:update mutation
 */

// Re-export components for agent definitions
export { components } from "../_generated/api";
