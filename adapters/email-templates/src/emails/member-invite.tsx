import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["memberInvite"];

export const subject = (ctx: TemplateContext, _params: Params) =>
  `Te invitaron a unirte a ${ctx.brandName}`;

export default function MemberInvite({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`Únete a ${ctx.brandName}`}>
      <Paragraph>
        {params.inviterName} te invitó a unirte a {ctx.brandName} como {params.role}.
      </Paragraph>
      <EmailButton href={params.inviteUrl}>Aceptar invitación</EmailButton>
      <Paragraph>Si no esperabas esta invitación, puedes ignorar este correo.</Paragraph>
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
