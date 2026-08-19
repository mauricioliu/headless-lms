import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["accessRevoked"];

export const subject = (_ctx: TemplateContext, params: Params) =>
  `Tu acceso a ${params.contentTitle} terminó`;

export default function AccessRevoked({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="Acceso finalizado">
      <Paragraph>
        Tu acceso a {params.contentTitle} terminó. Si crees que es un error, responde este correo.
      </Paragraph>
    </Layout>
  );
}

AccessRevoked.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: {
    contentTitle: "Fly Tying 101",
  },
};
