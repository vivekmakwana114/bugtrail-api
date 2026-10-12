/**
 * Response shapes for users. The server decides what each endpoint returns: fields are
 * picked explicitly (an allow-list), so a field added to the model later never leaks
 * by accident, and lists stay small.
 *
 *   userRef      → the smallest reference: a name and avatar (project card manager, later bug grid rows)
 *   userSummary  → lists and embedded members
 *   userDetail   → a single user, /auth/me, login
 *   registration → the response to self-registration
 */

/** Fields to select when populating a user that will go through userSummary (or userRef). */
const userSummaryFields = 'name email role status avatarUrl';

/**
 * @param {User|null} user
 * @returns {{ id: string, name: string, avatarUrl: string|null }|null}
 */
const userRef = (user) => (user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl } : null);

/**
 * @param {User} user
 * @returns {{ id: string, name: string, email: string, role: string|null, status: string, avatarUrl: string|null }}
 */
const userSummary = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  avatarUrl: user.avatarUrl,
});

/**
 * @param {User} user
 * @returns {Object} summary + effective permissions and activity dates
 */
const userDetail = (user) => ({
  ...userSummary(user),
  permissions: user.getPermissions(),
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
});

/**
 * @param {User} user
 * @returns {{ id: string, name: string, email: string, status: string }}
 */
const registration = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  status: user.status,
});

/**
 * @param {QueryResult} page - output of the paginate plugin
 * @returns {Object} same pagination meta, results as summaries
 */
const userPage = ({ results, page, limit, totalPages, totalResults }) => ({
  results: results.map(userSummary),
  page,
  limit,
  totalPages,
  totalResults,
});

export { userSummaryFields };
export default { userRef, userSummary, userDetail, registration, userPage };
