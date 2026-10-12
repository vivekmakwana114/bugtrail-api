import express from 'express';
import { auth } from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import notificationValidation from '../../validations/notification.validation.js';
import notificationController from '../../controllers/notification.controller.js';

const router = express.Router();

// Everyone has a bell, so these need only auth(). Every query is limited to your own notifications.
// The fixed paths come before /:notificationId so "read-all" isn't taken for an id.
router.get('/', auth(), validate(notificationValidation.getNotifications), notificationController.getNotifications);
router.get('/unread-count', auth(), notificationController.getUnreadCount);
router.patch('/read-all', auth(), notificationController.markAllRead);
router.patch('/:notificationId/read', auth(), validate(notificationValidation.markRead), notificationController.markRead);

export default router;

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Your bell. New ones also arrive live as `notification:new` on Socket.IO.
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Your notifications, newest first
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: unread, schema: { type: boolean }, description: Only unread ones }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 10 } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NotificationPage' }
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: The number on the bell
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer, example: 3 }
 */

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: Mark all your notifications read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "204":
 *         description: No content
 */

/**
 * @swagger
 * /notifications/{notificationId}/read:
 *   patch:
 *     summary: Mark one notification read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: notificationId, required: true, schema: { type: string } }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Notification' }
 *       "404":
 *         description: Not found (or not yours)
 */
