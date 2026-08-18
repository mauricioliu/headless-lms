import { NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { evaluationEvents } from './events.js';
import type { Evaluation, EvaluationView, ReplaceEvaluationInput } from './model.js';
import type {
  EvaluationCourseReader,
  EvaluationRepository,
  EvaluationUnitOfWork,
} from './ports.js';

function withoutCorrectionKey(evaluation: Evaluation): EvaluationView {
  return {
    courseId: evaluation.courseId,
    cutoff: evaluation.cutoff,
    feedbackMode: evaluation.feedbackMode,
    questions: evaluation.questions.map(({ correctOptionId: _, ...question }) => question),
  };
}

export interface EvaluationServiceParams {
  repo: EvaluationRepository;
  uow: EvaluationUnitOfWork;
  courses: EvaluationCourseReader;
  logger?: Logger;
}

export class EvaluationService {
  private readonly repo: EvaluationRepository;
  private readonly uow: EvaluationUnitOfWork;
  private readonly courses: EvaluationCourseReader;
  private readonly logger: Logger;

  constructor(params: EvaluationServiceParams) {
    this.repo = params.repo;
    this.uow = params.uow;
    this.courses = params.courses;
    this.logger = params.logger ?? noopLogger;
  }

  async get(orgId: string, courseId: string): Promise<EvaluationView | null> {
    const evaluation = await this.repo.findByCourseId(orgId, courseId);
    return evaluation ? withoutCorrectionKey(evaluation) : null;
  }

  async replace(
    orgId: string,
    courseId: string,
    input: ReplaceEvaluationInput,
  ): Promise<EvaluationView> {
    if (!(await this.courses.getCourse(orgId, courseId))) {
      throw new NotFoundError('Course', courseId);
    }
    const view = await this.uow.run(async ({ evaluations, outbox }) => {
      const evaluation = await evaluations.replace(orgId, courseId, input);
      const sanitized = withoutCorrectionKey(evaluation);
      await outbox.append([evaluationEvents.replaced.make({ orgId, data: sanitized })]);
      return sanitized;
    });
    this.logger.info('evaluation replaced', {
      orgId,
      courseId,
      questionCount: input.questions.length,
    });
    return view;
  }
}
