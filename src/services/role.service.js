import { Role } from '../models/index.js';
import { ADMIN_ROLE_SLUG, defaultRoles } from '../config/defaultRoles.js';

/**
 * Insert any missing default role. Idempotent: safe to run on every seed.
 * Existing roles keep the permissions an Admin gave them ($setOnInsert),
 * except Admin, whose permissions the Role model always resets to the full catalog.
 * @returns {Promise<Role[]>}
 */
const ensureDefaultRoles = async () => {
  await Role.bulkWrite(
    defaultRoles.map((role) => ({
      updateOne: {
        filter: { slug: role.slug },
        update: { $setOnInsert: role },
        upsert: true,
      },
    })),
  );
  // bulkWrite skips document middleware, so re-save Admin to apply its full-catalog rule.
  const admin = await Role.findOne({ slug: ADMIN_ROLE_SLUG });
  await admin.save();
  return Role.find({ slug: { $in: defaultRoles.map((role) => role.slug) } });
};

/**
 * @param {string} slug
 * @returns {Promise<Role|null>}
 */
const getRoleBySlug = async (slug) => Role.findOne({ slug });

/**
 * @param {ObjectId} id
 * @returns {Promise<Role|null>}
 */
const getRoleById = async (id) => Role.findById(id);

export default {
  ensureDefaultRoles,
  getRoleBySlug,
  getRoleById,
};
