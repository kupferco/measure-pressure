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
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend rejected the message (${res.status}): ${body.slice(0, 500)}`);
    }
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
