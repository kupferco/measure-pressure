import { config } from '../config.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

/**
 * The message could not be handed to the provider.
 *
 * Separated from other failures because it is almost always configuration rather
 * than a transient fault, and because the person waiting for a sign-in code
 * deserves to be told the email is not coming instead of being left watching an
 * inbox.
 */
export class MailDeliveryError extends Error {
  readonly configuration: boolean;

  constructor(message: string, options: { configuration: boolean }) {
    super(message);
    this.name = 'MailDeliveryError';
    this.configuration = options.configuration;
  }
}

/**
 * Local development. Prints the message - including the login code - to the server
 * log, so signing in needs no mail provider, no API key and no inbox.
 */
class ConsoleMailer implements Mailer {
  async send(email: Email): Promise<void> {
    console.log(
      [
        '',
        '='.repeat(72),
        `EMAIL to ${email.to}`,
        `Subject: ${email.subject}`,
        '-'.repeat(72),
        email.text.trim(),
        '='.repeat(72),
        '',
      ].join('\n'),
    );
  }
}

/** Resend's REST API. Used over their SDK to keep one fewer dependency. */
class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string) {}

  async send(email: Email): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: config.MAIL_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    if (res.ok) return;

    const body = await res.text().catch(() => '');
    let detail = body.slice(0, 500);
    let name = '';
    try {
      const parsed = JSON.parse(body) as { message?: string; name?: string };
      detail = parsed.message ?? detail;
      name = parsed.name ?? '';
    } catch {
      // Not JSON; the raw body is the best detail available.
    }

    /*
     * The failure worth naming precisely.
     *
     * Resend's shared sender, onboarding@resend.dev, is a sandbox: it delivers
     * only to the address the Resend account was registered with and returns 403
     * for everyone else. That is invisible while you are testing with your own
     * address and then breaks the moment you invite somebody - which is exactly
     * when nobody is watching the logs.
     */
    const usingSandboxSender = /@resend\.dev/i.test(config.MAIL_FROM);
    if (res.status === 403 && usingSandboxSender) {
      throw new MailDeliveryError(
        `Resend refused to send to ${email.to}. The sender ${config.MAIL_FROM} is ` +
          'Resend\'s sandbox address, which only delivers to the address the Resend ' +
          'account was registered with. Verify a domain in Resend and set MAIL_FROM ' +
          'to an address on it.',
        { configuration: true },
      );
    }

    throw new MailDeliveryError(
      `Resend rejected the message (${res.status}${name ? ` ${name}` : ''}): ${detail}`,
      { configuration: res.status === 401 || res.status === 403 },
    );
  }
}

export const mailer: Mailer =
  config.MAIL_TRANSPORT === 'resend'
    ? new ResendMailer(config.RESEND_API_KEY!)
    : new ConsoleMailer();

/**
 * The login email. Carries both credentials: the link works in a browser, the code
 * works in the app. Whichever the person uses, the other is consumed with it.
 */
export function buildLoginEmail(to: string, token: string, code: string, isNew: boolean): Email {
  const link = `${config.WEB_ORIGIN}/verify?token=${encodeURIComponent(token)}`;
  const minutes = config.MAGIC_LINK_TTL_MINUTES;
  const greeting = isNew ? 'Welcome to Measure Pressure.' : 'Here is your sign-in link.';

  const text = [
    greeting,
    '',
    `In the app, enter this code:   ${code}`,
    '',
    'Or open this link in a browser:',
    link,
    '',
    `Either one expires in ${minutes} minutes and can only be used once.`,
    'If you did not ask to sign in, you can ignore this email.',
  ].join('\n');

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="font-size:16px;margin:0 0 24px">${greeting}</p>
  <p style="font-size:13px;color:#666;margin:0 0 8px">In the app, enter this code:</p>
  <p style="font-size:34px;font-weight:700;letter-spacing:6px;margin:0 0 28px;font-variant-numeric:tabular-nums">${code}</p>
  <p style="font-size:13px;color:#666;margin:0 0 12px">Or open it in a browser:</p>
  <p style="margin:0 0 28px">
    <a href="${link}" style="display:inline-block;background:#1a7f5a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">Sign in</a>
  </p>
  <p style="font-size:12px;color:#888;margin:0;line-height:1.5">
    Either one expires in ${minutes} minutes and can only be used once.<br>
    If you did not ask to sign in, you can ignore this email.
  </p>
</div>`.trim();

  return { to, subject: `Your Measure Pressure sign-in code: ${code}`, text, html };
}
