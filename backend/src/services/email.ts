/**
 * Castar — Email Service (Resend.com)
 * Sends 4-digit verification codes via email.
 *
 * Resend.com API: https://resend.com/docs/api-reference/emails/send-email
 */

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Send a verification code email via Resend.com.
 *
 * @param email — recipient email address
 * @param code — 4-digit verification code
 * @param apiKey — Resend.com API key (from env.RESEND_API_KEY)
 */
export async function sendEmailCode(
  email: string,
  code: string,
  apiKey: string,
): Promise<SendEmailResult> {
  if (!apiKey) {
    return { ok: false, error: 'Missing RESEND_API_KEY' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Castar <onboarding@resend.dev>',
        to: email,
        subject: 'Castar — Verification Code',
        html: `
          <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px; text-align: center;">
            <h2 style="color: #0A0A0A; font-size: 24px; font-weight: 500; margin-bottom: 8px;">Castar</h2>
            <p style="color: #666; font-size: 16px; margin-bottom: 24px;">Your verification code:</p>
            <div style="background: #F5F5F5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <span style="font-size: 32px; font-weight: 600; letter-spacing: 8px; color: #0A0A0A;">${code}</span>
            </div>
            <p style="color: #999; font-size: 14px;">This code expires in 5 minutes.</p>
            <p style="color: #999; font-size: 14px;">If you didn't request this, please ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      await response.text().catch(() => '');
      console.log(`[Email] Resend API error ${response.status}`);
      return { ok: false, error: `Resend API error: ${response.status}` };
    }

    const result = await response.json() as { id?: string };
    console.log(`[Email] Sent, message id: ${result.id ? 'present' : 'missing'}`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[Email] Failed to send: ${message}`);
    return { ok: false, error: message };
  }
}
