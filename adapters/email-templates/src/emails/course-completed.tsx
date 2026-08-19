import type { EmailTemplateParams, TemplateContext } from "@headless-lms/core/types";
import { Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

type Params = EmailTemplateParams["courseCompleted"];

export const subject = (_ctx: TemplateContext, params: Params) =>
  `Completaste ${params.courseTitle} 🎉`;

export default function CourseCompleted({ ctx, params }: { ctx: TemplateContext; params: Params }) {
  return (
    <Layout ctx={ctx} heading="¡Felicitaciones!">
      <Paragraph>Completaste {params.courseTitle}. Buen trabajo.</Paragraph>
    </Layout>
  );
}

CourseCompleted.PreviewProps = {
  ctx: PREVIEW_CTX,
  params: {
    courseTitle: "Fly Tying 101",
  },
};
