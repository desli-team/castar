/**
 * Castar — SMS Service (Eskiz.uz)
 * Sends 4-digit verification codes via SMS.
 *
 * Eskiz.uz API: https://documenter.getpostman.com/view/663428/RzfmES4z
 * POST https://notify.eskiz.uz/api/message/sms/send
 */

export interface SendSmsResult {
  ok: boolean;
  error?: string;
}

/**
 * Send a verification code SMS via Eskiz.uz.
 *
 * @param phone — recipient phone number (e.g. "+998901234567")
 * @param code — 4-digit verification code
 * @param token — Eskiz.uz Bearer token (from env.ESKIZ_TOKEN)
 */
export async function sendSmsCode(
  phone: string,
  code: string,
  token: string,
): Promise<SendSmsResult> {
  if (!token) {
    return { ok: false, error: 'Missing ESKIZ_TOKEN' };
  }

  try {
    // Eskiz expects phone WITHOUT leading "+" (e.g. 998901234567)
    const cleanPhone = phone.replace(/^\+/, '');

    const response = await fetch('https://notify.eskiz.uz/api/message/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        mobile_phone: cleanPhone,
        message: `Castar: Tasdiqlash kodi: ${code}`,
        from: '4546',
      }),
    });

    if (!response.ok) {
      await response.text().catch(() => '');
      console.log(`[SMS] Eskiz API error ${response.status}`);
      return { ok: false, error: `Eskiz API error: ${response.status}` };
    }

    const result = (await response.json()) as {
      id?: string;
      status?: string;
      message?: string;
    };
    console.log('[SMS] Sent, response:', JSON.stringify({ status: result.status, hasId: Boolean(result.id) }));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[SMS] Failed to send: ${message}`);
    return { ok: false, error: message };
  }
}
