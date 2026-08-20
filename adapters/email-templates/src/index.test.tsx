import { describe, it, expect } from "vitest";
import type {
  EmailTemplateId,
  EmailTemplateParams,
  TemplateContext,
} from "@headless-lms/core/types";
import { ReactEmailTemplateRenderer } from "./index.js";

const CTX: TemplateContext = {
  brandName: "Minera Los Andes",
  baseUrl: "http://localhost:8001",
  studentPortalUrl: "http://localhost:8002",
};

const SAMPLE_PARAMS: { [K in EmailTemplateId]: EmailTemplateParams[K] } = {
  magicLink: { url: "http://localhost:8001/magic?token=t" },
  studentInvite: { inviteUrl: "http://localhost:8002/welcome?token=t", studentName: "Camila" },
  memberInvite: {
    inviteUrl: "http://localhost:8001/invite?token=t",
    inviterName: "Ana",
    role: "admin",
  },
  passwordReset: { resetUrl: "http://localhost:8002/reset?token=t" },
  emailVerification: { verifyUrl: "http://localhost:8002/verify?token=t" },
  accessGranted: { contentTitle: "Ley Karin", contentId: "c1" },
  accessRevoked: { contentTitle: "Ley Karin" },
  courseCompleted: { courseTitle: "Ley Karin" },
};

const ALL_IDS = Object.keys(SAMPLE_PARAMS) as EmailTemplateId[];

/** The Spanish every template must show: exact subject plus body copy that has
 *  to survive into both renderings. */
const EXPECTED: { [K in EmailTemplateId]: { subject: string; body: string[] } } = {
  magicLink: {
    subject: "Entra a Minera Los Andes",
    body: ["Haz clic en el botón para entrar.", "Si no fuiste tú, puedes ignorar este correo."],
  },
  studentInvite: {
    subject: "Te invitaron a Minera Los Andes",
    body: ["Camila, te invitaron a Minera Los Andes.", "Este enlace es personal: no lo reenvíes."],
  },
  memberInvite: {
    subject: "Te invitaron a unirte a Minera Los Andes",
    body: ["Ana te invitó a unirte a Minera Los Andes como admin."],
  },
  passwordReset: {
    subject: "Restablecer la contraseña de Minera Los Andes",
    body: [
      "Se solicitó restablecer la contraseña de esta cuenta.",
      "el enlace expira pronto.",
      "la contraseña actual no cambia y este correo puede ignorarse.",
    ],
  },
  emailVerification: {
    subject: "Confirma tu correo en Minera Los Andes",
    body: ["Confirma que este correo es tuyo para terminar de configurar tu cuenta."],
  },
  accessGranted: {
    subject: "Ya tienes acceso a Ley Karin",
    body: ["Te dieron acceso. Entra cuando quieras."],
  },
  accessRevoked: {
    subject: "Tu acceso a Ley Karin terminó",
    body: ["Tu acceso a Ley Karin terminó.", "responde este correo."],
  },
  courseCompleted: {
    subject: "Completaste Ley Karin 🎉",
    body: ["Completaste Ley Karin. Buen trabajo."],
  },
};

describe("ReactEmailTemplateRenderer", () => {
  const renderer = new ReactEmailTemplateRenderer();

  it.each(ALL_IDS)("renders %s with subject, html and text", async (id) => {
    const content = await renderer.render(id, CTX, SAMPLE_PARAMS[id]);
    expect(content.subject.length).toBeGreaterThan(0);
    expect(content.html).toContain("<");
    expect(content.text.length).toBeGreaterThan(0);
  });

  it.each(ALL_IDS)("renders %s entirely in Spanish (tú register)", async (id) => {
    const content = await renderer.render(id, CTX, SAMPLE_PARAMS[id]);
    expect(content.subject).toBe(EXPECTED[id].subject);
    // The html render splits interpolated values with React's SSR text
    // markers; strip them so the copy asserts as one string.
    const html = content.html.replaceAll("<!-- -->", "");
    for (const phrase of EXPECTED[id].body) {
      expect(html).toContain(phrase);
      expect(content.text).toContain(phrase);
    }
  });

  it("interpolates the params into html and text", async () => {
    const content = await renderer.render("studentInvite", CTX, SAMPLE_PARAMS.studentInvite);
    expect(content.html).toContain("http://localhost:8002/welcome?token=t");
    expect(content.text).toContain("http://localhost:8002/welcome?token=t");
  });

  it("brands every email with the context brand name", async () => {
    const content = await renderer.render("magicLink", CTX, SAMPLE_PARAMS.magicLink);
    expect(content.html).toContain("Minera Los Andes");
  });

  it("escapes html in user-supplied params data", async () => {
    const content = await renderer.render("accessGranted", CTX, {
      contentTitle: "<script>alert(1)</script>",
      contentId: "c1",
    });
    expect(content.html).not.toContain("<script>");
  });
});
