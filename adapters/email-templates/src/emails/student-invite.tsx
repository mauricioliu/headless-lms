import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["studentInvite"];

export const subject = (ctx: TemplateContext, _params: Params) => `Te invitaron a ${ctx.brandName}`;

export default function StudentInvite({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Recibiste una invitación">
      <Paragraph>
        {params.studentName}, te invitaron a {ctx.brandName}. Crea tu cuenta para empezar.
      </Paragraph>
      <EmailButton href={params.inviteUrl}>Crear mi cuenta</EmailButton>
      <Paragraph>Este enlace es personal: no lo reenvíes.</Paragraph>
    </Layout>
  );
}

StudentInvite.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: {
    inviteUrl: "http://localhost:8002/welcome?token=demo",
    studentName: "Sam",
  },
};
