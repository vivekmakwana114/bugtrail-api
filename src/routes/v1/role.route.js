import express from 'express';
import { auth } from '../../middlewares/auth.js';
import { permissionGroups } from '../../config/permissions.js';
import { roleDefinitions } from '../../config/roles.js';

const router = express.Router();

/**
 * Read-only access catalog, served from code (there is no Role collection).
 * The approval screen uses it for the role picker (showing what each role can do), and the
 * web app for role and permission labels. Any signed-in user may read it: it's labels, not data.
 */
const catalog = {
  roles: Object.entries(roleDefinitions).map(([key, definition]) => ({
    key,
    label: definition.label,
    description: definition.description,
    permissions: [...definition.permissions],
  })),
  permissionGroups,
};

router.get('/', auth(), (req, res) => {
  res.send(catalog);
});

export default router;

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Read-only catalog of the fixed roles and their permissions, served from code
 */

/**
 * @swagger
 * /roles:
 *   get:
 *     summary: The four roles with what each can do, and the grouped permission labels
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AccessCatalog' }
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */
