// discussion context — domain events, owned by @headless-lms/types.
import type { NewDomainEvent } from '../shared/ports.js';
import type { DiscussionEvent } from '@headless-lms/types';

export type {
  DiscussionEvent,
  CommentCreated,
  CommentPublished,
  CommentReported,
  CommentRemoved,
} from '@headless-lms/types';
export type NewDiscussionEvent = NewDomainEvent<DiscussionEvent>;
