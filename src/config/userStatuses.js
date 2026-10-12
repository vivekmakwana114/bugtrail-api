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

export { userStatuses };
