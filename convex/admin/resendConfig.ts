export type ResendConfig = {
  autoSend: boolean;
  audienceId?: string;
  fromAddress?: string;
  replyTo?: string;
};

export const EMPTY_CONFIG: ResendConfig = { autoSend: false };

export function readConfig(row: unknown): ResendConfig {
  if (!row || typeof row !== "object") return EMPTY_CONFIG;
  const r = row as {
    resendAutoSend?: boolean;
    resendAudienceId?: string;
    resendFromAddress?: string;
    resendReplyTo?: string;
  };
  return {
    autoSend: r.resendAutoSend ?? false,
    audienceId: r.resendAudienceId,
    fromAddress: r.resendFromAddress,
    replyTo: r.resendReplyTo,
  };
}
