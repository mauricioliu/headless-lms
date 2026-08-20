import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["magicLink"];

export const subject = (ctx: TemplateContext, _params: Params) => `Entra a ${ctx.brandName}`;

export default function MagicLink({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Iniciar sesión">
      <Paragraph>
        Haz clic en el botón para entrar. Este enlace es personal: funciona una sola
        vez.
      </Paragraph>
      <EmailButton href={params.url}>Entrar a {ctx.brandName}</EmailButton>
      <Paragraph>Si no fuiste tú, puedes ignorar este correo.</Paragraph>
    </Layout>
  );
}

MagicLink.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: { url: "http://localhost:8002/magic?token=demo" },
};
