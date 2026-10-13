import express from 'express';
import { auth, authorize } from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import messageValidation from '../../validations/message.validation.js';
import messageController from '../../controllers/message.controller.js';

const router = express.Router();

// Listing and sending live under /bugs/:bugId/messages. These act on one message, and only your own.
router
  .route('/:messageId')
  .patch(auth(), authorize('chat:send'), validate(messageValidation.editMessage), messageController.editMessage)
  .delete(auth(), authorize('chat:send'), validate(messageValidation.deleteMessage), messageController.deleteMessage);

export default router;

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Messages on a bug. Saved through REST, then broadcast over Socket.IO to the bug's room.
 */

/**
 * @swagger
 * /messages/{messageId}:
 *   parameters:
 *     - { in: path, name: messageId, required: true, schema: { type: string } }
 *   patch:
 *     summary: Edit your own message within 15 seconds of sending it (requires chat:send); after that it is final
 *     description: Broadcast as `message:updated`. Mentions aren't re-notified.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string, maxLength: 5000 }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       "403":
 *         description: Not your message
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     summary: Delete your own message (requires chat:send)
 *     description: Soft delete; stays in the thread as "message deleted". Broadcast as `message:deleted`.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "204":
 *         description: No content
 *       "403":
 *         description: Not your message
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
