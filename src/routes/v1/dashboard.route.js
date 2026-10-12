import express from 'express';
import { auth, authorize } from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import dashboardValidation from '../../validations/dashboard.validation.js';
import dashboardController from '../../controllers/dashboard.controller.js';

const router = express.Router();

// Every number is limited to the projects you can see (the same scope as /projects and /bugs).
router.get(
  '/summary',
  auth(),
  authorize('dashboard:view'),
  validate(dashboardValidation.getSummary),
  dashboardController.getSummary,
);
router.get(
  '/bug-status',
  auth(),
  authorize('dashboard:view'),
  validate(dashboardValidation.getBugStatus),
  dashboardController.getBugStatus,
);
// Comparing people is more sensitive than counting bugs: it has its own permission.
router.get(
  '/developer-performance',
  auth(),
  authorize('dashboard:view_performance'),
  validate(dashboardValidation.getDeveloperPerformance),
  dashboardController.getDeveloperPerformance,
);
router.get(
  '/slowest-tickets',
  auth(),
  authorize('dashboard:view'),
  validate(dashboardValidation.getSlowestTickets),
  dashboardController.getSlowestTickets,
);

export default router;

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: |
 *     Numbers for the dashboard, limited to the projects you can see. Common filters:
 *     `projectId` (one project), `from` / `to` (when the bug was reported; `2026-10-12` or an ISO
 *     date-time; a date-only `to` covers that whole day, in UTC).
 */

/**
 * @swagger
 * components:
 *   parameters:
 *     DashboardProjectId: { in: query, name: projectId, schema: { type: string }, description: Limit to one project you can see }
 *     DashboardFrom: { in: query, name: from, schema: { type: string, example: '2026-10-01' }, description: Bugs reported on or after }
 *     DashboardTo: { in: query, name: to, schema: { type: string, example: '2026-10-31' }, description: Bugs reported on or before (date-only = end of that day, UTC) }
 */

/**
 * @swagger
 * /dashboard/summary:
 *   get:
 *     summary: Top cards (requires dashboard:view)
 *     description: Projects by status (not date-filtered) and bugs by status, with the open count.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/DashboardProjectId'
 *       - $ref: '#/components/parameters/DashboardFrom'
 *       - $ref: '#/components/parameters/DashboardTo'
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projects:
 *                   type: object
 *                   properties:
 *                     active: { type: integer, example: 4 }
 *                     completed: { type: integer, example: 2 }
 *                     archived: { type: integer, example: 1 }
 *                 bugs: { $ref: '#/components/schemas/BugSummary' }
 *       "404":
 *         description: projectId is not a project you can see
 */

/**
 * @swagger
 * /dashboard/bug-status:
 *   get:
 *     summary: Bug count per status, for the chart (requires dashboard:view)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/DashboardProjectId'
 *       - $ref: '#/components/parameters/DashboardFrom'
 *       - $ref: '#/components/parameters/DashboardTo'
 *     responses:
 *       "200":
 *         description: All five statuses in lifecycle order, zeros included
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statuses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       status: { type: string, enum: [reported, ongoing, resolved, pass, failed] }
 *                       count: { type: integer }
 */

/**
 * @swagger
 * /dashboard/developer-performance:
 *   get:
 *     summary: Per-assignee performance (requires dashboard:view_performance)
 *     description: |
 *       Over the bugs in scope currently assigned to each person (a reassigned bug counts for its current assignee).
 *       firstPassRate = passed bugs that never failed ÷ passed bugs (null when nothing passed).
 *       avgTimeToPassMs = average time from reported to pass.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/DashboardProjectId'
 *       - $ref: '#/components/parameters/DashboardFrom'
 *       - $ref: '#/components/parameters/DashboardTo'
 *     responses:
 *       "200":
 *         description: Sorted by passed, then assigned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 developers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       developer: { $ref: '#/components/schemas/UserRef' }
 *                       assigned: { type: integer, example: 12 }
 *                       open: { type: integer, example: 3 }
 *                       passed: { type: integer, example: 9 }
 *                       totalFails: { type: integer, example: 4 }
 *                       firstPassRate: { type: number, nullable: true, example: 0.6667 }
 *                       avgTimeToPassMs: { type: integer, nullable: true, example: 172800000 }
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 */

/**
 * @swagger
 * /dashboard/slowest-tickets:
 *   get:
 *     summary: Longest-running tickets by age (requires dashboard:view)
 *     description: Age = reported until passed, or until now. Same row shape as the ticket grid.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/DashboardProjectId'
 *       - $ref: '#/components/parameters/DashboardFrom'
 *       - $ref: '#/components/parameters/DashboardTo'
 *       - { in: query, name: open, schema: { type: boolean }, description: Only tickets that haven't passed }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 50, default: 10 } }
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tickets: { type: array, items: { $ref: '#/components/schemas/BugListItem' } }
 */
