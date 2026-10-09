import express from 'express';
import validate from '../../middlewares/validate.js';
import { auth } from '../../middlewares/auth.js';
import authValidation from '../../validations/auth.validation.js';
import authController from '../../controllers/auth.controller.js';

const router = express.Router();

router.post('/register', validate(authValidation.register), authController.register);
router.post('/login', validate(authValidation.login), authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-tokens', authController.refreshTokens);
router.post('/forgot-password', validate(authValidation.forgotPassword), authController.forgotPassword);
router.post('/reset-password', validate(authValidation.resetPassword), authController.resetPassword);
router.post('/change-password', auth(), validate(authValidation.changePassword), authController.changePassword);
router.get('/me', auth(), authController.getMe);

export default router;

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication. The refresh token lives in an httpOnly cookie scoped to /v1/auth.
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register (account starts pending until an approver activates it)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email, description: must be unique }
 *               password: { type: string, format: password, minLength: 8, description: At least one number and one letter }
 *             example: { name: Jane QA, email: jane@example.com, password: password1 }
 *     responses:
 *       "201":
 *         description: Created (status pending, no tokens issued)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/Registration' }
 *                 message: { type: string }
 *       "400":
 *         $ref: '#/components/responses/DuplicateEmail'
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login (sets the refreshToken cookie)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *             example: { email: jane@example.com, password: password1 }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Session' }
 *       "401":
 *         description: Incorrect email or password
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       "403":
 *         description: Account is pending, suspended or rejected
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { code: 403, message: Your account is awaiting approval }
 */

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout (revokes the refresh token from the cookie and clears it; idempotent)
 *     tags: [Auth]
 *     responses:
 *       "204":
 *         description: No content
 */

/**
 * @swagger
 * /auth/refresh-tokens:
 *   post:
 *     summary: Rotate tokens using the refreshToken cookie
 *     tags: [Auth]
 *     responses:
 *       "200":
 *         description: OK (new refreshToken cookie set)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tokens:
 *                   type: object
 *                   properties:
 *                     access: { $ref: '#/components/schemas/Token' }
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email (always 204, so it can't reveal which emails exist)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       "204":
 *         description: No content
 */

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password (also signs out every session)
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: The reset password token from the email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, format: password, minLength: 8 }
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         description: Password reset failed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change your own password (signs out other sessions, keeps this one)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword: { type: string, format: password, minLength: 8 }
 *     responses:
 *       "200":
 *         description: OK (new refreshToken cookie set)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tokens:
 *                   type: object
 *                   properties:
 *                     access: { $ref: '#/components/schemas/Token' }
 *       "400":
 *         description: Current password is incorrect, or new password invalid
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Current user with role and effective permissions
 *     tags: [Auth]
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
 *                 user: { $ref: '#/components/schemas/UserDetail' }
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */
