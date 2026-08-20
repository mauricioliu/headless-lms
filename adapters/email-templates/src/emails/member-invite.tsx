import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["memberInvite"];

// ADR 0002: hacia el Admin Cliente, "usted" cuando hace falta un pronombre;
// nunca el "tú" del Trabajador.
export const subject = (ctx: TemplateContext, _params: Params) =>
  `Invitación a unirse a ${ctx.brandName}`;

export default function MemberInvite({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`Invitación a ${ctx.brandName}`}>
      <Paragraph>
        {params.inviterName} le invitó a unirse a {ctx.brandName} como {params.role}.
      </Paragraph>
      <EmailButton href={params.inviteUrl}>Aceptar invitación</EmailButton>
      <Paragraph>Si no esperaba esta invitación, puede ignorar este correo.</Paragraph>
    </Layout>
  );
}

MemberInvite.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: {
    inviteUrl: "http://localhost:8001/invite?token=demo",
    inviterName: "Ann",
    role: "admin",
  },
};
