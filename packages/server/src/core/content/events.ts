import { z } from 'zod';
import {
  activitySchema,
  courseSchema,
  downloadSchema,
  moduleSchema,
} from '@headless-lms/types/schemas';
import {
  defineEvent,
  type EventOf,
  type EventOfValues,
} from '../shared/ports.js';

export const contentEvents = {
  courseCreated: defineEvent({
    type: 'content.course.created',
    version: 1,
    data: courseSchema,
  }),
  courseUpdated: defineEvent({
    type: 'content.course.updated',
    version: 1,
    data: courseSchema,
  }),
  courseDeleted: defineEvent({
    type: 'content.course.deleted',
    version: 1,
    data: courseSchema,
  }),
  moduleCreated: defineEvent({
    type: 'content.course.module.created',
    version: 1,
    data: moduleSchema,
  }),
  moduleUpdated: defineEvent({
    type: 'content.course.module.updated',
    version: 1,
    data: moduleSchema,
  }),
  moduleDeleted: defineEvent({
    type: 'content.course.module.deleted',
    version: 1,
    data: moduleSchema,
  }),
  modulesReordered: defineEvent({
    type: 'content.course.modules.reordered',
    version: 1,
    data: z.array(moduleSchema),
  }),
  activityCreated: defineEvent({
    type: 'content.course.activity.created',
    version: 1,
    data: activitySchema,
  }),
  activityUpdated: defineEvent({
    type: 'content.course.activity.updated',
    version: 1,
    data: activitySchema,
  }),
  activityDeleted: defineEvent({
    type: 'content.course.activity.deleted',
    version: 1,
    data: activitySchema,
  }),
  activitiesReordered: defineEvent({
    type: 'content.course.activities.reordered',
    version: 1,
    data: moduleSchema,
  }),
  downloadCreated: defineEvent({
    type: 'content.download.created',
    version: 1,
    data: downloadSchema,
  }),
  downloadUpdated: defineEvent({
    type: 'content.download.updated',
    version: 1,
    data: downloadSchema,
  }),
  downloadDeleted: defineEvent({
    type: 'content.download.deleted',
    version: 1,
    data: downloadSchema,
  }),
};

export type CourseCreated = EventOf<typeof contentEvents.courseCreated>;
export type CourseUpdated = EventOf<typeof contentEvents.courseUpdated>;
export type CourseDeleted = EventOf<typeof contentEvents.courseDeleted>;
export type CourseModuleCreated = EventOf<typeof contentEvents.moduleCreated>;
export type CourseModuleUpdated = EventOf<typeof contentEvents.moduleUpdated>;
export type CourseModuleDeleted = EventOf<typeof contentEvents.moduleDeleted>;
export type CourseModulesReordered = EventOf<typeof contentEvents.modulesReordered>;
export type CourseActivityCreated = EventOf<typeof contentEvents.activityCreated>;
export type CourseActivityUpdated = EventOf<typeof contentEvents.activityUpdated>;
export type CourseActivityDeleted = EventOf<typeof contentEvents.activityDeleted>;
export type CourseActivitiesReordered = EventOf<typeof contentEvents.activitiesReordered>;
export type DownloadCreated = EventOf<typeof contentEvents.downloadCreated>;
export type DownloadUpdated = EventOf<typeof contentEvents.downloadUpdated>;
export type DownloadDeleted = EventOf<typeof contentEvents.downloadDeleted>;
export type ContentEvent = EventOfValues<typeof contentEvents>;
