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
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push({ ...message });
  }

  to(recipient: string): EmailMessage[] {
    return this.sent.filter((m) => m.to === recipient);
  }

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
