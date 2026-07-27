// discussion context — public surface. Re-export only what other layers may use.
export { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
export type {
  DiscussionService,
  DiscussionRepository,
  DiscussionUnitOfWork,
  DiscussionWriteScope,
  ThreadView,
  QueueEntry,
  QueueQuery,
  Actor,
  AuthorRecord,
  CommentWithContext,
} from './ports.js';
export type {
  Comment,
  CommentAuthor,
  CommentStatus,
  CommentReaction,
  CommentReport,
  DiscussionSettings,
  ActivityThreadState,
  ThreadState,
} from './model.js';
export type { PostCommentInput, ResolvedThreadConfig, ThreadComment } from './types.js';
export type { DiscussionEvent } from './events.js';
