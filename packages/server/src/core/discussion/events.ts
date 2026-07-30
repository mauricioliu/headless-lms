// discussion context — domain events, owned by @headless-lms/types.
import type { NewDomainEvent } from '../shared/ports.js';
import type { CommentEvent } from '@headless-lms/types';

export type {
  CommentEvent,
  CommentCreated,
  CommentPublished,
  CommentReported,
  CommentRemoved,
} from '@headless-lms/types';
export type NewDiscussionEvent = NewDomainEvent<CommentEvent>;
