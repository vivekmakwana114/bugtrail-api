import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { BugMessage } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import bugService from './bug.service.js';
import notificationService from './notification.service.js';
import { emitToBug, getUserIdsViewingBug } from '../sockets/emitter.js';
import { projectStatuses } from '../config/projectStatuses.js';
import { notificationTypes } from '../config/notificationTypes.js';
import { MESSAGE_EDIT_WINDOW_MS } from '../config/chat.js';
import { messageSerializer } from '../serializers/index.js';
import { userSummaryFields } from '../serializers/user.serializer.js';

/*
 * Chat on a bug. Access is the bug's access: if you can see the bug (project scope), you can
 * read its chat (chat:read) and post (chat:send). Every write is saved first, then broadcast to
 * the `bug:<id>` room, so the database is the source of truth and nothing is lost on reconnect.
 */

const populateMessage = (query) =>
  query.populate([
    { path: 'sender', select: userSummaryFields },
    { path: 'mentions', select: userSummaryFields },
  ]);

/**
 * A message the actor may change: it exists, isn't deleted, its bug is still visible to them,
 * and they wrote it.
 * @param {User} actor
 * @param {ObjectId} messageId
 * @returns {Promise<{ message: BugMessage, project: Project }>}
 */
const getOwnMessageOrThrow = async (actor, messageId) => {
  const message = await BugMessage.findOne({ _id: messageId, deletedAt: null });
  if (!message) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  }
  const { project } = await bugService.getBugOrThrow(actor, message.bug.toString()); // 404 if out of scope
  if (!message.sender.equals(actor._id)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only change your own messages');
  }
  return { message, project };
};

/**
 * @param {Project} project
 */
const assertProjectWritable = (project) => {
  if (project.status === projectStatuses.ARCHIVED) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This project is archived: its chat is read-only');
  }
};

/**
 * One page of a thread. Pages go backwards in time: the first call (no cursor) returns the latest
 * messages; pass `nextCursor` as `before` to load older ones. Messages in a page are oldest first,
 * ready to render top to bottom.
 *
 * A cursor (the oldest _id seen) instead of page numbers: while you scroll back, new messages keep
 * arriving at the end, and page numbers would shift and show duplicates. "Older than X" doesn't.
 *
 * @param {User} actor
 * @param {string} bugRef - id or key
 * @param {{ before?: string, limit?: number }} options
 * @returns {Promise<{ messages: BugMessage[], nextCursor: string|null }>}
 */
const listMessages = async (actor, bugRef, { before, limit = 30 }) => {
  const { bug } = await bugService.getBugOrThrow(actor, bugRef);
  const filter = { bug: bug._id, ...(before && { _id: { $lt: new mongoose.Types.ObjectId(before) } }) };
  // One extra tells us whether there's an older page, without a count query.
  const rows = await populateMessage(
    BugMessage.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1),
  );
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse();
  return { messages, nextCursor: hasMore ? messages[0].id : null };
};

/**
 * @param {User} actor
 * @param {ObjectId} bugId
 * @param {{ body: string, mentions?: string[] }} body
 * @returns {Promise<BugMessage>}
 */
const sendMessage = async (actor, bugId, { body, mentions = [] }) => {
  const { bug, project } = await bugService.getBugOrThrow(actor, bugId);
  assertProjectWritable(project);

  // Only project members can be mentioned; anything else in the list is ignored, so a client
  // can't use mentions to notify (or reveal the bug to) people outside the project.
  const mentionIds = [...new Set(mentions)].filter((id) => project.hasMember(id));

  const created = await BugMessage.create({
    bug: bug._id,
    project: project._id,
    sender: actor._id,
    body,
    mentions: mentionIds,
  });
  const message = await populateMessage(BugMessage.findById(created._id));
  emitToBug(bug.id, 'message:new', messageSerializer.messageItem(message));

  // People with the bug open just saw it arrive live; don't also ping their bell.
  const viewing = await getUserIdsViewingBug(bug.id);
  const key = `${project.key}-${bug.bugNumber}`;
  const common = {
    actor,
    entity: { kind: 'bug', id: bug.id, projectId: project.id, key },
    link: `/projects/${project.key}/bugs/${key}`,
    skipUserIds: viewing,
  };
  const preview = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  await notificationService.notify({
    ...common,
    recipients: mentionIds,
    type: notificationTypes.BUG_MENTIONED,
    title: `${actor.name} mentioned you on ${key}`,
    message: preview,
  });
  // Mentioned people already got the more specific notification above.
  await notificationService.notify({
    ...common,
    recipients: [bug.assignee, bug.reporter],
    skipUserIds: new Set([...viewing, ...mentionIds]),
    type: notificationTypes.BUG_MESSAGE,
    title: `New message on ${key}`,
    message: `${actor.name}: ${preview}`,
  });
  return message;
};

/**
 * Edit your own message, only within MESSAGE_EDIT_WINDOW_MS of sending it (15s). Mentions aren't
 * re-sent: editing shouldn't ping people again.
 * @param {User} actor
 * @param {ObjectId} messageId
 * @param {{ body: string }} body
 * @returns {Promise<BugMessage>}
 */
const editMessage = async (actor, messageId, { body }) => {
  const { message, project } = await getOwnMessageOrThrow(actor, messageId);
  assertProjectWritable(project);
  if (Date.now() - message.createdAt.getTime() > MESSAGE_EDIT_WINDOW_MS) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `Messages can only be edited for ${MESSAGE_EDIT_WINDOW_MS / 1000} seconds after sending.`,
    );
  }
  message.body = body;
  message.editedAt = new Date();
  await message.save();
  const populated = await populateMessage(BugMessage.findById(message._id));
  emitToBug(message.bug, 'message:updated', messageSerializer.messageItem(populated));
  return populated;
};

/**
 * Delete your own message (soft: it stays in the thread as "message deleted").
 * @param {User} actor
 * @param {ObjectId} messageId
 */
const deleteMessage = async (actor, messageId) => {
  const { message, project } = await getOwnMessageOrThrow(actor, messageId);
  assertProjectWritable(project);
  message.deletedAt = new Date();
  await message.save();
  emitToBug(message.bug, 'message:deleted', { id: message.id, bugId: message.bug.toString() });
};

export default { listMessages, sendMessage, editMessage, deleteMessage };
