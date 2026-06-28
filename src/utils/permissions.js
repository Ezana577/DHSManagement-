// ─────────────────────────────────────────────────────────────
//  DHS Permission Utility
//  Role IDs must be set in your .env file.
//
//  Hierarchy (highest → lowest):
//    LS  → ROLE_LS
//    SHR → ROLE_SHR
//    HR  → ROLE_HR
// ─────────────────────────────────────────────────────────────

const ROLE_LS  = process.env.ROLE_LS;
const ROLE_SHR = process.env.ROLE_SHR;
const ROLE_HR  = process.env.ROLE_HR;

/**
 * Returns true if the GuildMember has any of the given role IDs.
 */
function hasAnyRole(member, ...roleIds) {
    return roleIds.some(id => id && member.roles.cache.has(id));
}

export function isLS(member)  { return hasAnyRole(member, ROLE_LS); }
export function isSHR(member) { return hasAnyRole(member, ROLE_LS, ROLE_SHR); }
export function isHR(member)  { return hasAnyRole(member, ROLE_LS, ROLE_SHR, ROLE_HR); }
