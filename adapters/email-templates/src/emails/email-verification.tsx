import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["emailVerification"];

export const subject = (ctx: TemplateContext, _params: Params) =>
  `Confirma tu correo en ${ctx.brandName}`;

export default function EmailVerification({
  ctx,
  params,
}: {
  ctx: TemplateContext;
  params: Params;
}) {
  return (
    <Layout ctx={ctx} heading="Confirma tu correo">
      <Paragraph>Confirma que este correo es tuyo para terminar de configurar tu cuenta.</Paragraph>
      <EmailButton href={params.verifyUrl}>Confirmar correo</EmailButton>
    </Layout>
  );
}

EmailVerification.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { verifyUrl: "http://localhost:8002/verify?token=demo" },
};
