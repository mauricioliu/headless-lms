// Test doubles for the email seam. The mailer is an EmailSender that records
// every message instead of delivering it, so tests assert on what was sent;
// the renderer inlines template params into deterministic text/html, so any
// link the caller passed (inviteUrl, magic-link url) is greppable in the
// captured message without dragging React Email into the test run.
import type {
  EmailContent,
  EmailMessage,
  EmailSender,
  EmailTemplateId,
  EmailTemplateParams,
  TemplateContext,
  TemplateRenderer,
} from '@headless-lms/core/shared/ports';

export class TestMailer implements EmailSender {
  /** Every message sent since construction or the last clear(). */
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push({ ...message });
  }

  /** Messages sent to one recipient. */
  to(recipient: string): EmailMessage[] {
    return this.sent.filter((m) => m.to === recipient);
  }

  /** The most recent message overall, or to one recipient. */
  last(recipient?: string): EmailMessage | undefined {
    if (recipient === undefined) {
      return this.sent.at(-1);
    }
    return this.to(recipient).at(-1);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

export class EchoTemplateRenderer implements TemplateRenderer {
  async render<K extends EmailTemplateId>(
    id: K,
    _ctx: TemplateContext,
    params: EmailTemplateParams[K],
  ): Promise<EmailContent> {
    const text = JSON.stringify({ template: id, params });
    return { subject: id, text, html: `<pre>${text}</pre>` };
  }
}
