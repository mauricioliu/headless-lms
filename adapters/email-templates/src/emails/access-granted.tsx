import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["accessGranted"];

export const subject = (_ctx: TemplateContext, params: Params) =>
  `Ya tienes acceso a ${params.contentTitle}`;

export default function AccessGranted({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading={`${params.contentTitle} ya está disponible`}>
      <Paragraph>Te dieron acceso. Entra cuando quieras.</Paragraph>
      <EmailButton href={`${ctx.studentPortalUrl}/courses/${params.contentId}`}>
        Empezar a aprender
      </EmailButton>
    </Layout>
  );
}

AccessGranted.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: {
    contentTitle: "Fly Tying 101",
    contentId: "demo",
  },
};
