import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import catchAsync from '../utils/catchAsync.js';
import { notificationService } from '../services/index.js';
import { notificationSerializer } from '../serializers/index.js';

const getNotifications = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['unread']);
  const options = pick(req.query, ['limit', 'page']);
  const result = await notificationService.queryNotifications(req.user, filter, options);
  res.send(notificationSerializer.notificationPage(result));
});

const getUnreadCount = catchAsync(async (req, res) => {
  res.send({ count: await notificationService.getUnreadCount(req.user) });
});

const markRead = catchAsync(async (req, res) => {
  const notification = await notificationService.markRead(req.user, req.params.notificationId);
  res.send(notificationSerializer.notificationItem(notification));
});

const markAllRead = catchAsync(async (req, res) => {
  await notificationService.markAllRead(req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

export default { getNotifications, getUnreadCount, markRead, markAllRead };
