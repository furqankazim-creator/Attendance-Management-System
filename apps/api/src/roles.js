// Roles and what each may do. Permission names are checked by the API on every route.
export const ROLES = {
  owner: {
    label: 'Owner',
    about: 'Full control of the organisation, including creating staff accounts.',
    perms: ['sites.write', 'workers.read', 'workers.write', 'board.read', 'approve.read', 'approve.write', 'reports.read', 'audit.read', 'staff.manage'],
  },
  hr: {
    label: 'HR',
    about: 'Manages sites, workers, approvals, reports and the audit log. Cannot manage staff accounts.',
    perms: ['sites.write', 'workers.read', 'workers.write', 'board.read', 'approve.read', 'approve.write', 'reports.read', 'audit.read'],
  },
  supervisor: {
    label: 'Site supervisor',
    about: 'Sees and approves only the workers at their own site. Cannot edit sites or workers.',
    perms: ['workers.read', 'board.read', 'approve.read', 'approve.write', 'reports.read'],
  },
  auditor: {
    label: 'Auditor (read-only)',
    about: 'Can view everything, including the audit log, but cannot change anything.',
    perms: ['workers.read', 'board.read', 'approve.read', 'reports.read', 'audit.read'],
  },
  worker: {
    label: 'Worker',
    about: 'Mobile app only: checks in and out, views own history, sends leave and correction requests.',
    perms: [],
  },
};
export const STAFF_ROLES = ['hr', 'supervisor', 'auditor'];
export const can = (role, perm) => !!ROLES[role]?.perms.includes(perm);
