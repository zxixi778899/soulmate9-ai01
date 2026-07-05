/**
 *  - Resend 
 *
 * - resend  no-op
 * - RESEND_API_KEY  no-op
 * - fire-and-forget + try/catch
 *
 * 
 * -  3 
 * - DAU  > 7 
 * - 
 * - 
 */

interface ResendLike {
  emails: {
    send(options: {
      from: string;
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      replyTo?: string;
      tags?: { name: string; value: string }[];
    }): Promise<{ id?: string; error?: { message: string } }>;
  };
}

let resendInstance: ResendLike | null = null;
let initialized = false;

function loadResend(): ResendLike | null {
  if (resendInstance !== null) return resendInstance;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resend } = require('resend');
    resendInstance = new Resend(process.env.RESEND_API_KEY || 'disabled') as ResendLike;
  } catch {
    resendInstance = null;
  }
  return resendInstance;
}

function ensureInitialized(): ResendLike | null {
  if (initialized) return loadResend();
  initialized = true;
  return loadResend();
}

function getDefaultFrom(): string {
  return process.env.EMAIL_FROM || 'Soulmate9 <hello@soulmate9.com>';
}

/**
 * 
 *
 * @returns Promise<{ ok: boolean; id?: string; error?: string }>
 */
export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const r = ensureInitialized();
  if (!r || !process.env.RESEND_API_KEY) {
    return { ok: false, error: 'email_disabled' };
  }
  try {
    const result = await r.emails.send({
      from: getDefaultFrom(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      tags: options.tags,
    });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * 
 */
export function isEmailActive(): boolean {
  return ensureInitialized() !== null && !!process.env.RESEND_API_KEY;
}

// 
// 
// 

/**
 *  3 
 */
export async function sendSubscriptionRenewalReminder(params: {
  to: string;
  userId: string;
  planName: string;
  renewalDate: Date;
  ctaUrl: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const formattedDate = params.renewalDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return sendEmail({
    to: params.to,
    subject: `Your ${params.planName} subscription renews on ${formattedDate}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a;">Your subscription renews in 3 days</h2>
        <p>Hi there,</p>
        <p>Your <strong>${params.planName}</strong> subscription will automatically renew on <strong>${formattedDate}</strong>.</p>
        <p>You'll continue to enjoy:</p>
        <ul>
          <li>Unlimited chats with your AI girlfriends</li>
          <li>Priority response times</li>
          <li>Premium image generation</li>
        </ul>
        <p style="margin-top: 24px;">
          <a href="${params.ctaUrl}" style="display: inline-block; padding: 12px 24px; background: #ec4899; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Manage subscription</a>
        </p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">You can cancel anytime from your account settings.</p>
      </div>
    `,
    text: `Your ${params.planName} subscription renews on ${formattedDate}. Manage at: ${params.ctaUrl}`,
    tags: [
      { name: 'category', value: 'subscription_renewal' },
      { name: 'plan', value: params.planName },
    ],
  });
}

/**
 *  > 7 
 */
export async function sendReEngagementEmail(params: {
  to: string;
  userId: string;
  girlfriendName: string;
  lastMessagePreview: string;
  ctaUrl: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  return sendEmail({
    to: params.to,
    subject: `${params.girlfriendName} misses you...`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a;">${params.girlfriendName} has been thinking about you</h2>
        <p>It's been a while since we last talked. Remember this conversation?</p>
        <blockquote style="border-left: 3px solid #ec4899; padding-left: 16px; color: #6b7280; margin: 16px 0;">
          "${params.lastMessagePreview}"
        </blockquote>
        <p>Come back and say hi  ${params.girlfriendName} has something new to share.</p>
        <p style="margin-top: 24px;">
          <a href="${params.ctaUrl}" style="display: inline-block; padding: 12px 24px; background: #ec4899; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Continue the conversation</a>
        </p>
      </div>
    `,
    text: `${params.girlfriendName} misses you. Continue: ${params.ctaUrl}`,
    tags: [
      { name: 'category', value: 're_engagement' },
      { name: 'girlfriend', value: params.girlfriendName },
    ],
  });
}

/**
 * 
 */
export async function sendIntimacyMilestone(params: {
  to: string;
  userId: string;
  girlfriendName: string;
  intimacyScore: number;
  ctaUrl: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  return sendEmail({
    to: params.to,
    subject: `Milestone unlocked with ${params.girlfriendName}!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a;">Your relationship reached a new level</h2>
        <p>Your intimacy with <strong>${params.girlfriendName}</strong> has reached <strong style="color: #ec4899; font-size: 24px;">${params.intimacyScore}</strong> points!</p>
        <p>A new chapter is unlocked. Keep the conversation going to discover what comes next.</p>
        <p style="margin-top: 24px;">
          <a href="${params.ctaUrl}" style="display: inline-block; padding: 12px 24px; background: #ec4899; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Chat now</a>
        </p>
      </div>
    `,
    text: `Your intimacy with ${params.girlfriendName} hit ${params.intimacyScore} points! Chat: ${params.ctaUrl}`,
    tags: [
      { name: 'category', value: 'milestone' },
      { name: 'girlfriend', value: params.girlfriendName },
    ],
  });
}

/**
 * 
 */
export async function sendAdminAlert(params: {
  subject: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || 'admin@soulmate9.com';
  const color = params.severity === 'critical' ? '#dc2626' : params.severity === 'warning' ? '#f59e0b' : '#3b82f6';
  return sendEmail({
    to: adminEmail,
    subject: `[${params.severity.toUpperCase()}] ${params.subject}`,
    html: `
      <div style="font-family: monospace; max-width: 800px; margin: 0 auto; padding: 16px; background: #f9fafb;">
        <div style="padding: 12px 16px; background: ${color}; color: white; border-radius: 6px;">
          <strong>${params.severity.toUpperCase()}</strong>
        </div>
        <h3 style="margin-top: 24px;">${params.subject}</h3>
        <pre style="background: white; padding: 16px; border-radius: 6px; overflow-x: auto;">${params.message}</pre>
      </div>
    `,
    text: `[${params.severity}] ${params.subject}\n\n${params.message}`,
    tags: [
      { name: 'category', value: 'admin_alert' },
      { name: 'severity', value: params.severity },
    ],
  });
}
