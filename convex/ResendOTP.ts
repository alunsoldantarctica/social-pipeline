import { Email } from "@convex-dev/auth/providers/Email";
import { Resend as ResendAPI } from "resend";

/**
 * Generate a random 8-digit numeric OTP
 */
function generateOTP(): string {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < 8; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
}

/**
 * Resend-based Email OTP provider for Convex Auth.
 * Sends 8-digit verification codes via email for passwordless sign-in.
 *
 * Required environment variable:
 * - AUTH_RESEND_KEY: Resend API key (set in Convex dashboard)
 */
export const ResendOTP = Email({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15, // 15 minutes

  async generateVerificationToken() {
    return generateOTP();
  },

  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    const fromAddress = "Expedition Insure <help@expedition.insure>";
    const subject = `Your verification code: ${token}`;

    const otpHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #0A2540; font-size: 24px; margin-bottom: 20px;">
            Expedition Insure
          </h1>
          <p style="color: #4A5568; font-size: 16px; line-height: 1.6;">
            Use this code to sign in to your account:
          </p>
          <div style="background: #F7FAFC; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; color: #0A2540; letter-spacing: 4px;">
              ${token}
            </span>
          </div>
          <p style="color: #718096; font-size: 14px;">
            This code expires in 15 minutes. If you didn't request this code, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
          <p style="color: #A0AEC0; font-size: 12px;">
            Expedition Insure - Specialized Travel Insurance for Polar & Safari Adventures
          </p>
        </div>
      `;
    const otpText = `Your Expedition Insure verification code is: ${token}\n\nThis code expires in 15 minutes.`;

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [email],
      subject,
      html: otpHtml,
      text: otpText,
    });

    if (error) {
      console.error("Failed to send verification email:", error);
      throw new Error("Could not send verification email");
    }

    // Log the OTP email to the sentEmails table via the HTTP endpoint
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (siteUrl && provider.apiKey) {
      try {
        await fetch(`${siteUrl}/api/internal/log-otp-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            recipientEmail: email,
            to: [email],
            from: fromAddress,
            subject,
            resendId: data?.id,
            htmlBody: otpHtml,
            textBody: otpText,
          }),
        });
      } catch (e) {
        // Don't fail the auth flow if logging fails
        console.error("Failed to log OTP email:", e);
      }
    }
  },
});
