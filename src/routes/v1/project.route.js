import express from 'express';
import { auth, authorize } from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import projectValidation from '../../validations/project.validation.js';
import projectController from '../../controllers/project.controller.js';

const router = express.Router();

// authorize() answers "can you do this kind of thing?". Which projects you can do it to is the
// service's job (project scope): a PM with project:update can only edit projects they're in.
router
  .route('/')
  .post(auth(), authorize('project:create'), validate(projectValidation.createProject), projectController.createProject)
  .get(auth(), authorize('project:read'), validate(projectValidation.getProjects), projectController.getProjects);

router
  .route('/:projectId')
  .get(auth(), authorize('project:read'), validate(projectValidation.getProject), projectController.getProject)
  .patch(auth(), authorize('project:update'), validate(projectValidation.updateProject), projectController.updateProject)
  .delete(auth(), authorize('project:delete'), validate(projectValidation.deleteProject), projectController.deleteProject);

router.post(
  '/:projectId/members',
  auth(),
  authorize('project:manage_members'),
  validate(projectValidation.addMembers),
  projectController.addMembers,
);

router.delete(
  '/:projectId/members/:userId',
  auth(),
  authorize('project:manage_members'),
  validate(projectValidation.removeMember),
  projectController.removeMember,
);

export default router;

/**
 * @swagger
 * tags:
 *   name: Projects
 *   description: Projects, their members and the bug summary behind each project card's pie
 */

/**
 * @swagger
 * /projects:
 *   post:
 *     summary: Create a project (requires project:create)
 *     description: |
 *       `key` is the prefix of every bug key (BT-42). It's stored uppercase, must be unique (deleted
 *       projects keep theirs) and can't be changed later. The manager is added to the members and must
 *       be a Project Manager or an Admin. Members must be active users.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, key]
 *             properties:
 *               name: { type: string, maxLength: 100 }
 *               key: { type: string, pattern: '^[A-Za-z][A-Za-z0-9]{1,9}$' }
 *               description: { type: string, maxLength: 2000 }
 *               status: { type: string, enum: [active, completed, archived] }
 *               manager: { type: string, nullable: true }
 *               members: { type: array, items: { type: string } }
 *             example: { name: BugTrail, key: BT, description: Internal bug tracker }
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ProjectDetail' }
 *       "400":
 *         description: Invalid body, key already taken, or a member/manager who isn't eligible
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *   get:
 *     summary: List the projects you can see (requires project:read)
 *     description: Members see their projects; project:read_all (Admin) sees all. Each item carries the bug summary for its pie.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [active, completed, archived] } }
 *       - { in: query, name: search, schema: { type: string }, description: Matches name or key }
 *       - { in: query, name: sortBy, schema: { type: string, default: 'name:asc' }, description: "name | key | status | createdAt | updatedAt, :asc or :desc" }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 10 } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ProjectPage' }
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 */

/**
 * @swagger
 * /projects/{projectId}:
 *   parameters:
 *     - { in: path, name: projectId, required: true, schema: { type: string } }
 *   get:
 *     summary: Get a project with its members (requires project:read)
 *     description: A project outside your scope is a 404, not a 403, so ids can't be probed.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ProjectDetail' }
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     summary: Update a project (requires project:update, within your scope)
 *     description: Name, description, status, manager. The key can't change; members have their own endpoints. A new manager must already be a member.
 *     tags: [Projects]
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
 *               description: { type: string }
 *               status: { type: string, enum: [active, completed, archived] }
 *               manager: { type: string, nullable: true }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ProjectDetail' }
 *       "400":
 *         description: Invalid body, or the manager isn't an eligible member
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     summary: Delete a project (requires project:delete). Soft delete; the key stays reserved.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "204":
 *         description: No content
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /projects/{projectId}/members:
 *   post:
 *     summary: Add members (requires project:manage_members, within your scope)
 *     description: Idempotent. Only active users can be added.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds]
 *             properties:
 *               userIds: { type: array, minItems: 1, maxItems: 100, items: { type: string } }
 *     responses:
 *       "200":
 *         description: The full member list
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MemberList' }
 *       "400":
 *         description: A user doesn't exist or isn't active
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /projects/{projectId}/members/{userId}:
 *   delete:
 *     summary: Remove a member (requires project:manage_members, within your scope)
 *     description: The project manager can't be removed; change the manager first.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: string } }
 *       - { in: path, name: userId, required: true, schema: { type: string } }
 *     responses:
 *       "200":
 *         description: The full member list
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MemberList' }
 *       "400":
 *         description: The user is the project manager
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         description: Project not found, or the user isn't a member
 */
