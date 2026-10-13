import express from 'express';
import { auth, authorize } from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import userValidation from '../../validations/user.validation.js';
import userController from '../../controllers/user.controller.js';

const router = express.Router();

// /me must be registered before /:userId, or Express would treat "me" as a userId.
router.patch('/me', auth(), validate(userValidation.updateMe), userController.updateMe);

router
  .route('/')
  .post(auth(), authorize('user:create'), validate(userValidation.createUser), userController.createUser)
  .get(auth(), authorize('user:read'), validate(userValidation.getUsers), userController.getUsers);

router
  .route('/:userId')
  .get(auth(), authorize('user:read'), validate(userValidation.getUser), userController.getUser)
  .patch(auth(), authorize('user:update'), validate(userValidation.updateUser), userController.updateUser)
  .delete(auth(), authorize('user:delete'), validate(userValidation.deleteUser), userController.deleteUser);

router.patch(
  '/:userId/status',
  auth(),
  authorize('user:approve'),
  validate(userValidation.updateUserStatus),
  userController.updateUserStatus,
);

export default router;

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management, approval queue and own profile
 */

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Update your own profile (name, avatar). Password → POST /auth/change-password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               name: { type: string }
 *               avatarUrl: { type: string, format: uri, nullable: true }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserDetail' }
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create an active user with a role (requires user:create)
 *     description: Permissions follow from the role. Only an Admin can assign Admin, and you can't assign a role with permissions you don't hold.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, format: password, minLength: 8 }
 *               role: { type: string, enum: [admin, project_manager, developer, qa] }
 *             example: { name: Dana Developer, email: dana@example.com, password: password1, role: developer }
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserDetail' }
 *       "400":
 *         $ref: '#/components/responses/DuplicateEmail'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *   get:
 *     summary: List users (requires user:read)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: name, schema: { type: string }, description: Exact name }
 *       - { in: query, name: search, schema: { type: string }, description: "Part of the name or email, case-insensitive" }
 *       - { in: query, name: role, schema: { type: string, enum: [admin, project_manager, developer, qa] } }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, active, suspended, rejected] } }
 *       - { in: query, name: sortBy, schema: { type: string }, description: "field:asc|desc, e.g. name:asc" }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, default: 10 } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserPage' }
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 */

/**
 * @swagger
 * /users/{userId}:
 *   parameters:
 *     - { in: path, name: userId, required: true, schema: { type: string } }
 *   get:
 *     summary: Get a user (requires user:read)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserDetail' }
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     summary: Update a user (requires user:update)
 *     description: You can't manage a user with permissions you don't hold, or change your own role. Setting a password signs the user out everywhere.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, format: password, minLength: 8 }
 *               role: { type: string, enum: [admin, project_manager, developer, qa] }
 *               avatarUrl: { type: string, format: uri, nullable: true }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserDetail' }
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *       "409":
 *         description: Would demote the last active Admin
 *   delete:
 *     summary: Delete a user (requires user:delete). Prefer suspending.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "204":
 *         description: No content
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *       "409":
 *         description: Would delete the last active Admin
 */

/**
 * @swagger
 * /users/{userId}/status:
 *   patch:
 *     summary: Approve, reject, suspend or reactivate a user (requires user:approve)
 *     description: |
 *       Allowed moves: pending → active | rejected, active → suspended, suspended → active, rejected → active.
 *       Activating needs a role (in the body, or one the user already has).
 *       Leaving `active` ends the user's sessions.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: userId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [active, suspended, rejected] }
 *               role: { type: string, enum: [admin, project_manager, developer, qa] }
 *             example: { status: active, role: developer }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserDetail' }
 *       "400":
 *         description: Transition not allowed, or no role to activate with
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "409":
 *         description: Would suspend the last active Admin
 */
