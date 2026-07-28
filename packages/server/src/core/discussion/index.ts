// discussion context — public surface. Re-export only what other layers may use.
export { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
export type {
  DiscussionService,
  DiscussionRepository,
  DiscussionUnitOfWork,
  DiscussionWriteScope,
  ActivityComments,
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
  ActivityCommentsState,
  CommentsState,
} from './model.js';
export type { PostCommentInput, CommentsConfig, CommentView } from './types.js';
export type { DiscussionEvent } from './events.js';
