import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["passwordReset"];

// The one mail both readers get (Admin Cliente and Trabajador), so the copy is
// written without register — no tú, no usted.
export const subject = (ctx: TemplateContext, _params: Params) =>
  `Restablecer la contraseña de ${ctx.brandName}`;

export default function PasswordReset({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Restablecer contraseña">
      <Paragraph>
        Se solicitó restablecer la contraseña de esta cuenta. El botón abre la página para elegir
        una nueva; el enlace expira pronto.
      </Paragraph>
      <EmailButton href={params.resetUrl}>Restablecer contraseña</EmailButton>
      <Paragraph>
        Si no se solicitó este cambio, la contraseña actual no cambia y este correo puede ignorarse.
      </Paragraph>
    </Layout>
  );
}

PasswordReset.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { resetUrl: "http://localhost:8002/reset?token=demo" },
};
