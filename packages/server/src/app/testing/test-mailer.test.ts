import { describe, it, expect } from 'vitest';
import { TestMailer, EchoTemplateRenderer } from './test-mailer.js';

describe('TestMailer', () => {
  it('captures every sent message for assertion', async () => {
    const mailer = new TestMailer();

    await mailer.send({ to: 'juana@faena.local', subject: 'Invitación', text: 'enlace' });
    await mailer.send({ to: 'ana@nuvora.local', subject: 'Otro', text: 'x' });

    expect(mailer.sent.map((m) => m.to)).toEqual(['juana@faena.local', 'ana@nuvora.local']);
    expect(mailer.to('juana@faena.local')).toHaveLength(1);
    expect(mailer.last()?.to).toBe('ana@nuvora.local');
  });

  it('snapshots the message so later mutation cannot rewrite history', async () => {
    const mailer = new TestMailer();
    const message = { to: 'juana@faena.local', subject: 'Invitación', text: 'enlace' };

    await mailer.send(message);
    message.text = 'mutado';

    expect(mailer.sent[0]?.text).toBe('enlace');
  });

  it('clears the capture between scenarios', async () => {
    const mailer = new TestMailer();
    await mailer.send({ to: 'a@b.local', subject: 's', text: 't' });

    mailer.clear();

    expect(mailer.sent).toEqual([]);
  });
});

describe('EchoTemplateRenderer', () => {
  it('renders template params into deterministic text and html', async () => {
    const renderer = new EchoTemplateRenderer();
    const inviteUrl = 'http://student.test.local/welcome?token=tok_123';

    const content = await renderer.render(
      'studentInvite',
      { brandName: 'Nuvora', baseUrl: 'http://admin.test.local', studentPortalUrl: 'http://student.test.local' },
      { inviteUrl, studentName: 'juana@faena.local' },
    );

    expect(content.subject).toBe('studentInvite');
    expect(content.text).toContain(inviteUrl);
    expect(content.html).toContain(inviteUrl);
  });
});
