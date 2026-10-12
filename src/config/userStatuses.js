/**
 * Account lifecycle. Only `active` users can log in or use a token.
 *   pending   → self-registered, waiting for an approver
 *   active    → approved (or created by an Admin)
 *   suspended → access revoked, can be reactivated
 *   rejected  → registration declined
 */
const userStatuses = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REJECTED: 'rejected',
});

/**
 * Which status changes PATCH /users/:id/status allows. Anything else is a 400.
 *   pending   → active (approve, needs a role) | rejected
 *   active    → suspended
 *   suspended → active (reactivate)
 *   rejected  → active (changed our mind, needs a role)
 */
const allowedStatusTransitions = Object.freeze({
  [userStatuses.PENDING]: [userStatuses.ACTIVE, userStatuses.REJECTED],
  [userStatuses.ACTIVE]: [userStatuses.SUSPENDED],
  [userStatuses.SUSPENDED]: [userStatuses.ACTIVE],
  [userStatuses.REJECTED]: [userStatuses.ACTIVE],
});

export { userStatuses, allowedStatusTransitions };
