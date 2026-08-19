import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, CookieJar, TEST_STUDENT_PORTAL_URL, type TestApp } from './test-app.js';

let app: FastifyInstance;
let harness: TestApp;
let courseId: string;
let wave1Id: string;
let headers: () => { origin: string; cookie: string };

beforeAll(async () => {
  harness = await buildTestApp();
  app = harness.app;

  const jar = new CookieJar();
  headers = () => ({ origin: harness.origin, cookie: jar.header() });

  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: headers(),
    payload: {
      email: 'olas@nuvora.test',
      password: 'pilot-password-1',
      name: 'Admin Cliente',
    },
  });
  expect(signup.statusCode).toBeLessThan(400);
  jar.store(signup.headers['set-cookie']);

  const org = await app.inject({
    method: 'POST',
    url: '/api/organizations',
    headers: headers(),
    payload: { name: 'Faena Olas', slug: 'faena-olas' },
  });
  expect(org.statusCode).toBe(201);
  jar.drop('better-auth.session_data');

  const course = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: headers(),
    payload: { title: 'Ley Karin', description: 'Curso piloto', category: 'compliance' },
  });
  expect(course.statusCode).toBe(201);
  courseId = course.json().id as string;
}, 180_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

interface RenderedInvite {
  template: string;
  params: { inviteUrl: string; studentName: string };
}

function capturedInvite(to: string): RenderedInvite | undefined {
  const message = harness.mailer.to(to).at(-1);
  if (!message) {
    return undefined;
  }
  return JSON.parse(message.text) as RenderedInvite;
}

function tokenOf(to: string): string | undefined {
  const rendered = capturedInvite(to);
  return rendered
    ? (new URL(rendered.params.inviteUrl).searchParams.get('token') ?? undefined)
    : undefined;
}

const ROSTER = [
  'RUT,Nombre,Teléfono,Correo,Cargo',
  '12.345.678-5,Juana Pérez Rojas,+56 9 8123 4567,juana.perez@faena.test,Operadora',
  '9.876.543-2,Pedro Soto,+56961234567,pedro.soto@faena.test,',
  '15.111.222-3,"López, María",+56 9 5555 6666,maria.lopez@faena.test,Supervisora',
].join('\r\n');

const TRABAJADORES = [
  { email: 'juana.perez@faena.test', rut: '12.345.678-5', phone: '+56 9 8123 4567' },
  { email: 'pedro.soto@faena.test', rut: '9.876.543-2', phone: '+56961234567' },
  { email: 'maria.lopez@faena.test', rut: '15.111.222-3', phone: '+56 9 5555 6666' },
];

describe('Ola ingestion HTTP seam', () => {
  it('rejects an unauthenticated caller', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/waves',
      headers: { origin: harness.origin },
      payload: { name: 'Ola 1', courseId, csv: ROSTER },
    });
    expect(res.statusCode).toBe(401);
  });

  it('ingests an Ola from CSV: Trabajadores in bulk, one invitation email each', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/waves',
      headers: headers(),
      payload: { name: 'Ola 1', courseId, csv: ROSTER },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      name: 'Ola 1',
      courseId,
      memberCount: 3,
      invited: 3,
      alreadyActive: 0,
    });
    expect(JSON.stringify(body)).not.toContain('token');
    wave1Id = body.id as string;

    for (const trabajador of TRABAJADORES) {
      const captured = harness.mailer.to(trabajador.email);
      expect(captured).toHaveLength(1);
      const rendered = capturedInvite(trabajador.email)!;
      expect(rendered.template).toBe('studentInvite');
      const inviteUrl = new URL(rendered.params.inviteUrl);
      expect(`${inviteUrl.origin}${inviteUrl.pathname}`).toBe(`${TEST_STUDENT_PORTAL_URL}/welcome`);
      const token = inviteUrl.searchParams.get('token');
      expect(token).toBeTruthy();

      const peek = await app.inject({
        method: 'GET',
        url: `/api/organizations/invites/${token}`,
        headers: { origin: harness.origin },
      });
      expect(peek.statusCode).toBe(200);
      expect(peek.json().email).toBe(trabajador.email);
    }

    const students = await app.inject({
      method: 'GET',
      url: '/api/students',
      headers: headers(),
    });
    expect(students.statusCode).toBe(200);
    const page = students.json();
    expect(page.total).toBe(3);
    expect(page.rows.every((s: { status: string }) => s.status === 'invited')).toBe(true);
  }, 120_000);

  it('stores RUT and teléfono as roster data; neither reaches the invitation', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/api/waves/${wave1Id}`,
      headers: headers(),
    });
    expect(detail.statusCode).toBe(200);
    const members = detail.json().members as Array<{
      email: string;
      rut: string | null;
      phone: string | null;
      status: string;
    }>;
    expect(members).toHaveLength(3);
    for (const trabajador of TRABAJADORES) {
      const member = members.find((m) => m.email === trabajador.email);
      expect(member).toMatchObject({
        rut: trabajador.rut,
        phone: trabajador.phone,
        status: 'invited',
      });
    }

    for (const trabajador of TRABAJADORES) {
      const message = harness.mailer.to(trabajador.email)[0]!;
      expect(message.text).not.toContain(trabajador.rut);
      expect(message.text).not.toContain(trabajador.phone);
    }
  });

  it('inscribes every Trabajador in the Curso exactly once', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/api/waves/${wave1Id}`,
      headers: headers(),
    });
    const members = detail.json().members as Array<{ orgUserId: string }>;

    for (const member of members) {
      const grants = await app.inject({
        method: 'GET',
        url: `/api/entitlements?page=1&pageSize=50&orgUserId=${member.orgUserId}&contentId=${courseId}`,
        headers: headers(),
      });
      expect(grants.statusCode).toBe(200);
      expect(grants.json().total).toBe(1);
      expect(grants.json().rows[0]).toMatchObject({
        contentId: courseId,
        status: 'active',
        source: 'ola',
      });
    }
  });

  it('re-invites an individual Trabajador manually, rotating the token', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/students', headers: headers() });
    const juana = list
      .json()
      .rows.find((s: { email: string }) => s.email === 'juana.perez@faena.test');
    expect(juana).toBeTruthy();
    const oldToken = tokenOf('juana.perez@faena.test');

    const resend = await app.inject({
      method: 'POST',
      url: `/api/students/${juana.id}/invite/resend`,
      headers: headers(),
    });
    expect(resend.statusCode).toBe(204);

    expect(harness.mailer.to('juana.perez@faena.test')).toHaveLength(2);
    const newToken = tokenOf('juana.perez@faena.test');
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);

    const peekOld = await app.inject({
      method: 'GET',
      url: `/api/organizations/invites/${oldToken}`,
      headers: { origin: harness.origin },
    });
    expect(peekOld.statusCode).toBe(404);
    const peekNew = await app.inject({
      method: 'GET',
      url: `/api/organizations/invites/${newToken}`,
      headers: { origin: harness.origin },
    });
    expect(peekNew.statusCode).toBe(200);
    expect(peekNew.json().email).toBe('juana.perez@faena.test');
  });

  it('a Trabajador who accepted keeps their access; a second Ola re-invites only the pending', async () => {
    const token = tokenOf('juana.perez@faena.test')!;
    const jar = new CookieJar();
    const workerHeaders = () => ({ origin: TEST_STUDENT_PORTAL_URL, cookie: jar.header() });

    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: workerHeaders(),
      payload: {
        email: 'juana.perez@faena.test',
        password: 'trabajadora-password-1',
        name: 'Juana Pérez Rojas',
      },
    });
    expect(signup.statusCode).toBeLessThan(400);
    jar.store(signup.headers['set-cookie']);

    const accept = await app.inject({
      method: 'POST',
      url: '/api/organizations/invites/accept',
      headers: workerHeaders(),
      payload: { token },
    });
    expect(accept.statusCode).toBe(200);

    const juanaEmailsBefore = harness.mailer.to('juana.perez@faena.test').length;
    const pedroEmailsBefore = harness.mailer.to('pedro.soto@faena.test').length;

    const roster = [
      'RUT,Nombre,Telefono,Correo',
      '12.345.678-5,Juana Pérez Rojas,+56 9 9999 0000,jUANA.PEREZ@faena.test',
      '9.876.543-2,Pedro Soto,+56961234567,pedro.soto@faena.test',
      '8.222.333-4,Ana Nuñez,+56 9 7777 8888,ana.nunez@faena.test',
      '8.222.333-4,Ana Nuñez,+56 9 7777 8888,ana.nunez@faena.test',
    ].join('\n');

    const res = await app.inject({
      method: 'POST',
      url: '/api/waves',
      headers: headers(),
      payload: { name: 'Ola 2', courseId, csv: roster },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: 'Ola 2',
      memberCount: 3,
      invited: 2,
      alreadyActive: 1,
    });

    expect(harness.mailer.to('juana.perez@faena.test')).toHaveLength(juanaEmailsBefore);
    expect(harness.mailer.to('pedro.soto@faena.test')).toHaveLength(pedroEmailsBefore + 1);
    expect(harness.mailer.to('ana.nunez@faena.test')).toHaveLength(1);

    const students = await app.inject({
      method: 'GET',
      url: '/api/students',
      headers: headers(),
    });
    expect(students.json().total).toBe(4);

    const waves = await app.inject({ method: 'GET', url: '/api/waves', headers: headers() });
    const ola2 = waves.json().find((w: { name: string }) => w.name === 'Ola 2');
    const detail = await app.inject({
      method: 'GET',
      url: `/api/waves/${ola2.id}`,
      headers: headers(),
    });
    const juana = (
      detail.json().members as Array<{ email: string; phone: string | null; status: string }>
    ).find((m) => m.email.toLowerCase() === 'juana.perez@faena.test');
    expect(juana).toMatchObject({ phone: '+56 9 9999 0000', status: 'active' });

    const grants = await app.inject({
      method: 'GET',
      url: `/api/entitlements?page=1&pageSize=50&contentId=${courseId}`,
      headers: headers(),
    });
    expect(grants.json().total).toBe(4);
  }, 120_000);

  it('rejects an invalid roster without creating anything', async () => {
    const studentsBefore = (
      await app.inject({ method: 'GET', url: '/api/students', headers: headers() })
    ).json().total as number;
    const wavesBefore = (
      (
        await app.inject({ method: 'GET', url: '/api/waves', headers: headers() })
      ).json() as unknown[]
    ).length;
    const sentBefore = harness.mailer.sent.length;

    const missingColumn = await app.inject({
      method: 'POST',
      url: '/api/waves',
      headers: headers(),
      payload: { name: 'Ola mala', courseId, csv: 'RUT,Nombre,Telefono\n1-9,Alguien,+5691234567' },
    });
    expect(missingColumn.statusCode).toBe(400);
    expect(missingColumn.json().error).toBe('invalid_csv');
    expect(missingColumn.json().message).toContain('correo');

    const badEmail = await app.inject({
      method: 'POST',
      url: '/api/waves',
      headers: headers(),
      payload: {
        name: 'Ola mala',
        courseId,
        csv: 'RUT,Nombre,Telefono,Correo\n1-9,Alguien,+5691234567,no-es-correo',
      },
    });
    expect(badEmail.statusCode).toBe(400);
    expect(badEmail.json().message).toContain('row 2');

    const noRows = await app.inject({
      method: 'POST',
      url: '/api/waves',
      headers: headers(),
      payload: { name: 'Ola mala', courseId, csv: 'RUT,Nombre,Telefono,Correo' },
    });
    expect(noRows.statusCode).toBe(400);

    expect(
      (await app.inject({ method: 'GET', url: '/api/students', headers: headers() })).json().total,
    ).toBe(studentsBefore);
    expect(
      (
        (
          await app.inject({ method: 'GET', url: '/api/waves', headers: headers() })
        ).json() as unknown[]
      ).length,
    ).toBe(wavesBefore);
    expect(harness.mailer.sent.length).toBe(sentBefore);
  });

  it('404s when the Curso does not exist in the org', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/waves',
      headers: headers(),
      payload: { name: 'Ola 3', courseId: 'crs_inexistente', csv: ROSTER },
    });
    expect(res.statusCode).toBe(404);
  });
});
