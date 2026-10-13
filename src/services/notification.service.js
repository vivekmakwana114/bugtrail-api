import httpStatus from 'http-status';
import { Notification, User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import logger from '../config/logger.js';
import { userStatuses } from '../config/userStatuses.js';
import emailService from './email.service.js';
import { notificationEmail } from '../emails/templates.js';
import { emitToUsers } from '../sockets/emitter.js';
import { notificationSerializer } from '../serializers/index.js';
import { userSummaryFields } from '../serializers/user.serializer.js';

/**
 * Notify people about something that just happened.
 *
 *   1. In-app, always: a Notification row per recipient, pushed live to their `user:<id>` room.
 *   2. Email, only when `sendEmail` is true (the "Send email" checkbox): one outbox row each.
 *
 * Rules: the actor is never notified about their own action; only active users are notified;
 * each person is notified once even if they're listed twice (assignee AND reporter).
 *
 * Notifying is a side effect of a change that is ALREADY saved. If it fails, we log it and
 * carry on: the caller's request still succeeds, because failing it would make the client think
 * the bug change didn't happen when it did.
 *
 * @param {Object} params
 * @param {Array<ObjectId|string|null>} params.recipients
 * @param {User|null} params.actor
 * @param {string} params.type - notificationTypes
 * @param {string} params.title
 * @param {string} [params.message]
 * @param {Object} [params.entity] - { kind, id, projectId?, key? }
 * @param {string} [params.link] - web app path
 * @param {boolean} [params.sendEmail]
 * @param {Iterable<string>} [params.skipUserIds] - e.g. people already looking at the bug
 * @returns {Promise<void>}
 */
const notify = async ({
  recipients,
  actor,
  type,
  title,
  message = '',
  entity = null,
  link = null,
  sendEmail = false,
  skipUserIds = [],
}) => {
  try {
    const skip = new Set([...skipUserIds].map(String));
    if (actor) {
      skip.add(actor.id);
    }
    const ids = [...new Set(recipients.filter(Boolean).map(String))].filter((id) => !skip.has(id));
    if (!ids.length) {
      return;
    }

    const users = await User.find({ _id: { $in: ids }, status: userStatuses.ACTIVE }).select('name email');
    if (!users.length) {
      return;
    }

    const notifications = await Notification.insertMany(
      users.map((user) => ({ recipient: user._id, actor: actor?._id ?? null, type, title, message, entity, link })),
    );
    notifications.forEach((notification) => {
      // The actor is known here, so attach it instead of populating each row.
      notification.actor = actor ?? null; // eslint-disable-line no-param-reassign
      emitToUsers(notification.recipient, 'notification:new', notificationSerializer.notificationItem(notification));
    });

    if (sendEmail) {
      // One designed email per recipient (src/emails/templates.js), greeting them by name.
      const url = link ? emailService.appLink(link) : null;
      await Promise.all(
        users.map((user) =>
          emailService.queueTemplate(
            user.email,
            notificationEmail({ type, title, message, url, recipientName: user.name, actorName: actor?.name }),
          ),
        ),
      );
    }
  } catch (error) {
    logger.error(`notify(${type}) failed: ${error.message}`);
  }
};

/* ------------------------------------------------------------------ the bell (own notifications only) */

/**
 * @param {User} user
 * @param {{ unread?: boolean }} filter
 * @param {{ limit?: number, page?: number }} options
 * @returns {Promise<QueryResult>}
 */
const queryNotifications = async (user, { unread }, options) => {
  const page = await Notification.paginate(
    { recipient: user._id, ...(unread && { readAt: null }) },
    { ...options, sortBy: 'createdAt:desc' },
  );
  await Notification.populate(page.results, { path: 'actor', select: userSummaryFields });
  return page;
};

/**
 * @param {User} user
 * @returns {Promise<number>}
 */
const getUnreadCount = async (user) => Notification.countDocuments({ recipient: user._id, readAt: null });

/**
 * Someone else's notification is a 404, same as one that doesn't exist.
 * @param {User} user
 * @param {ObjectId} notificationId
 * @returns {Promise<Notification>}
 */
const markRead = async (user, notificationId) => {
  const notification = await Notification.findOne({ _id: notificationId, recipient: user._id });
  if (!notification) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
  }
  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }
  await notification.populate({ path: 'actor', select: userSummaryFields });
  return notification;
};

/**
 * @param {User} user
 * @returns {Promise<number>} how many were marked
 */
const markAllRead = async (user) => {
  const { modifiedCount } = await Notification.updateMany(
    { recipient: user._id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return modifiedCount;
};

export default { notify, queryNotifications, getUnreadCount, markRead, markAllRead };
