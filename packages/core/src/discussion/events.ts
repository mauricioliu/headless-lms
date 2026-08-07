import { commentReportSchema, commentSchema } from '../types/schemas/index.js';
import {
  defineEvent,
  type EventOf,
  type EventOfValues,
  type NewDomainEvent,
} from '../shared/ports.js';

export const discussionEvents = {
  commentCreated: defineEvent({
    type: 'discussion.comment.created',
    version: 1,
    data: commentSchema,
  }),
  commentPublished: defineEvent({
    type: 'discussion.comment.published',
    version: 1,
    data: commentSchema,
  }),
  commentRemoved: defineEvent({
    type: 'discussion.comment.removed',
    version: 1,
    data: commentSchema,
  }),
  commentReported: defineEvent({
    type: 'discussion.comment.reported',
    version: 1,
    data: commentReportSchema,
  }),
};

export type CommentCreated = EventOf<typeof discussionEvents.commentCreated>;
export type CommentPublished = EventOf<typeof discussionEvents.commentPublished>;
export type CommentRemoved = EventOf<typeof discussionEvents.commentRemoved>;
export type CommentReported = EventOf<typeof discussionEvents.commentReported>;
export type CommentEvent = EventOfValues<typeof discussionEvents>;
export type NewDiscussionEvent = NewDomainEvent<CommentEvent>;
