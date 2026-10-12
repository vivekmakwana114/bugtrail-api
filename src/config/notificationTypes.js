/**
 * What a notification is about. The web app picks the icon and wording by type;
 * `title` / `message` on the notification are ready-made text for the bell and for emails.
 */
const notificationTypes = Object.freeze({
  BUG_ASSIGNED: 'bug_assigned', // you were assigned a bug
  BUG_STATUS_CHANGED: 'bug_status_changed', // a bug you reported or work on changed status
  BUG_MESSAGE: 'bug_message', // new chat message on a bug you reported or work on
  BUG_MENTIONED: 'bug_mentioned', // someone @mentioned you in a bug's chat
  PROJECT_MEMBER_ADDED: 'project_member_added', // you were added to a project
  USER_REGISTERED: 'user_registered', // (approvers) someone is waiting for approval
});

const notificationTypeValues = Object.freeze(Object.values(notificationTypes));

export { notificationTypes, notificationTypeValues };
