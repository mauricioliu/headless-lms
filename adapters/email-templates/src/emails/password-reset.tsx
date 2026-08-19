import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["passwordReset"];

export const subject = (ctx: TemplateContext, _params: Params) =>
  `Restablece tu contraseña de ${ctx.brandName}`;

export default function PasswordReset({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Restablecer tu contraseña">
      <Paragraph>
        Haz clic en el botón para elegir una contraseña nueva. El enlace expira pronto.
      </Paragraph>
      <EmailButton href={params.resetUrl}>Restablecer contraseña</EmailButton>
      <Paragraph>
        Si no pediste el cambio, tu contraseña sigue igual y puedes ignorar este correo.
      </Paragraph>
    </Layout>
  );
}

PasswordReset.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { resetUrl: "http://localhost:8002/reset?token=demo" },
};
