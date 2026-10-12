import userSerializer from './user.serializer.js';

/**
 * @param {Notification} notification - actor populated (or an id when not)
 * @returns {Object}
 */
const notificationItem = (notification) => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  link: notification.link,
  entity: notification.entity,
  actor: notification.actor?.name ? userSerializer.userRef(notification.actor) : null,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
});

/**
 * @param {QueryResult} page
 * @returns {Object}
 */
const notificationPage = ({ results, page, limit, totalPages, totalResults }) => ({
  results: results.map(notificationItem),
  page,
  limit,
  totalPages,
  totalResults,
});

export default { notificationItem, notificationPage };
