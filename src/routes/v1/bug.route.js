import express from 'express';
import { auth, authorize } from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import bugValidation from '../../validations/bug.validation.js';
import bugController from '../../controllers/bug.controller.js';

const router = express.Router();

router
  .route('/')
  .post(auth(), authorize('bug:create'), validate(bugValidation.createBug), bugController.createBug)
  .get(auth(), authorize('bug:read'), validate(bugValidation.getBugs), bugController.getBugs);

router
  .route('/:bugId')
  .get(auth(), authorize('bug:read'), validate(bugValidation.getBug), bugController.getBug)
  .patch(auth(), authorize('bug:update'), validate(bugValidation.updateBug), bugController.updateBug)
  .delete(auth(), authorize('bug:delete'), validate(bugValidation.deleteBug), bugController.deleteBug);

// Who may make which move depends on the bug (current status, who's assigned), not just the role,
// so the route only requires bug:read and the transition table in bug.service decides (403).
router.patch(
  '/:bugId/status',
  auth(),
  authorize('bug:read'),
  validate(bugValidation.changeStatus),
  bugController.changeStatus,
);

router.patch('/:bugId/assign', auth(), authorize('bug:assign'), validate(bugValidation.assignBug), bugController.assignBug);

router.get(
  '/:bugId/activity',
  auth(),
  authorize('bug:read'),
  validate(bugValidation.getActivity),
  bugController.getActivity,
);

export default router;

/**
 * @swagger
 * tags:
 *   name: Bugs
 *   description: Bug tickets, the status workflow, assignment and the activity timeline
 */

/**
 * @swagger
 * /bugs:
 *   post:
 *     summary: Report a bug (requires bug:create, in a project you can see)
 *     description: |
 *       Gets the next number in the project (key BT-42). Status defaults to `reported`; only users
 *       with bug:set_any_status may start it elsewhere. The assignee must be an active project member
 *       who can work on bugs. Attachments are Google Drive links only. Archived projects are read-only.
 *     tags: [Bugs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [project, title, moduleName]
 *             properties:
 *               project: { type: string }
 *               title: { type: string, maxLength: 200 }
 *               moduleName: { type: string, maxLength: 100, description: Module or screen }
 *               description: { type: string, maxLength: 10000 }
 *               attachments: { type: array, maxItems: 20, items: { $ref: '#/components/schemas/Attachment' } }
 *               status: { type: string, enum: [reported, ongoing, resolved, pass, failed] }
 *               assignee: { type: string, nullable: true }
 *               sendEmail: { type: boolean, default: false }
 *             example:
 *               project: 5ebac534954b54139806c112
 *               title: Login button does nothing on Safari
 *               moduleName: Login
 *               description: Steps to reproduce...
 *               attachments: [{ title: Screen recording, url: 'https://drive.google.com/file/d/abc/view' }]
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BugDetail' }
 *       "400":
 *         description: Invalid body, non-Drive link, ineligible assignee, or archived project
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *   get:
 *     summary: The ticket grid (requires bug:read)
 *     description: Bugs in the projects you can see; pass projectId for one project.
 *     tags: [Bugs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: projectId, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string }, description: "Comma-separated, e.g. reported,ongoing" }
 *       - { in: query, name: assignee, schema: { type: string }, description: "A user id, me, or none" }
 *       - { in: query, name: moduleName, schema: { type: string } }
 *       - { in: query, name: search, schema: { type: string }, description: "Title or module; a bug key (BT-42) finds that bug" }
 *       - { in: query, name: sortBy, schema: { type: string, default: 'updatedAt:desc' }, description: "age | failCount | updatedAt | createdAt | bugNumber, :asc or :desc" }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BugPage' }
 *       "404":
 *         description: projectId is not a project you can see
 */

/**
 * @swagger
 * /bugs/{bugId}:
 *   parameters:
 *     - { in: path, name: bugId, required: true, schema: { type: string }, description: "Id (all routes) or key like BT-42 (GET only)" }
 *   get:
 *     summary: Get a bug by id or key (requires bug:read)
 *     tags: [Bugs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BugDetail' }
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     summary: Edit title, module, description, attachments (requires bug:update)
 *     description: Status and assignee have their own endpoints.
 *     tags: [Bugs]
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
 *               title: { type: string }
 *               moduleName: { type: string }
 *               description: { type: string }
 *               attachments: { type: array, items: { $ref: '#/components/schemas/Attachment' } }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BugDetail' }
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     summary: Delete a bug (requires bug:delete). Soft delete; its number is never reused.
 *     tags: [Bugs]
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
 * /bugs/{bugId}/status:
 *   patch:
 *     summary: Move a bug to another status
 *     description: |
 *       Allowed moves (the bug's `allowedStatuses` lists them for you):
 *       - bug:progress, as the assignee: reported → ongoing, ongoing → resolved, failed → ongoing
 *       - bug:verify: resolved → pass | failed
 *       - bug:set_any_status (QA, Admin): any → any
 *       Moving to failed adds 1 to failCount. 409 if someone else changed the bug first.
 *     tags: [Bugs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: bugId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [reported, ongoing, resolved, pass, failed] }
 *               sendEmail: { type: boolean, default: false }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BugDetail' }
 *       "400":
 *         description: Already in that status, or archived project
 *       "403":
 *         description: You can't make this move
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *       "409":
 *         description: Someone else changed the bug; reload
 */

/**
 * @swagger
 * /bugs/{bugId}/assign:
 *   patch:
 *     summary: Assign or unassign a bug (requires bug:assign)
 *     tags: [Bugs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: bugId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assignee]
 *             properties:
 *               assignee: { type: string, nullable: true }
 *               sendEmail: { type: boolean, default: false }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BugDetail' }
 *       "400":
 *         description: The assignee isn't an active project member who can work on bugs
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *       "409":
 *         description: Someone else changed the bug; reload
 */

/**
 * @swagger
 * /bugs/{bugId}/activity:
 *   get:
 *     summary: The bug's timeline, oldest first (requires bug:read)
 *     tags: [Bugs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: bugId, required: true, schema: { type: string }, description: Id or key }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ActivityList' }
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
