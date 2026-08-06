// ─────────────────────────────────────────────────────────────
//  DHS Deployment Database Helper
//  All Supabase reads/writes for the deployment tracking system
//  go through this file. Nothing outside this module should
//  import the Supabase client directly for deployment data.
// ─────────────────────────────────────────────────────────────

import supabase from './supabase.js';

export const HISTORY_PAGE_SIZE = 5;

/**
 * Atomically generates the next deployment ID for a guild, e.g. DEP-0001.
 * Backed by the increment_deployment_counter RPC (see supabase/schema.sql).
 */
export async function nextDeploymentId(guildId) {
    const { data, error } = await supabase.rpc('increment_deployment_counter', { p_guild_id: guildId });
    if (error) throw error;
    return `DEP-${String(data).padStart(4, '0')}`;
}

/**
 * Inserts a new deployment row when a deployment starts.
 */
export async function insertDeployment(row) {
    const { data, error } = await supabase.from('deployments').insert(row).select().single();
    if (error) throw error;
    return data;
}

/**
 * Updates a deployment row by its Discord message ID. Used when a
 * deployment ends, since the message ID is always known to the button handler.
 */
export async function updateDeploymentByMessageId(messageId, updates) {
    const { data, error } = await supabase
        .from('deployments')
        .update(updates)
        .eq('message_id', messageId)
        .select()
        .maybeSingle();
    if (error) throw error;
    return data;
}

/**
 * Fetches every deployment where the user was host, co-host, or attendee.
 * Used for computing profile stats. Not paginated — intended for aggregation only.
 */
export async function getDeploymentsForUser(guildId, userId) {
    const { data, error } = await supabase
        .from('deployments')
        .select('*')
        .eq('guild_id', guildId)
        .or(`host_id.eq.${userId},cohost_id.eq.${userId},attendees.cs.{${userId}}`)
        .order('start_time', { ascending: false });
    if (error) throw error;
    return data ?? [];
}

/**
 * Fetches one page of a user's deployment history, newest first.
 */
export async function getDeploymentHistoryPage(guildId, userId, page) {
    const from = page * HISTORY_PAGE_SIZE;
    const to = from + HISTORY_PAGE_SIZE - 1;

    const { data, error, count } = await supabase
        .from('deployments')
        .select('*', { count: 'exact' })
        .eq('guild_id', guildId)
        .or(`host_id.eq.${userId},cohost_id.eq.${userId},attendees.cs.{${userId}}`)
        .order('start_time', { ascending: false })
        .range(from, to);

    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
}

/**
 * Reduces a set of deployment rows into profile summary stats for one user.
 */
export function computeDeploymentStats(rows, userId) {
    const hosted = rows.filter((r) => r.host_id === userId).length;
    const cohosted = rows.filter((r) => r.cohost_id === userId).length;
    const attended = rows.filter((r) => Array.isArray(r.attendees) && r.attendees.includes(userId)).length;

    const completed = rows.filter((r) => r.status === 'Completed' && typeof r.duration === 'number');
    const totalSeconds = completed.reduce((sum, r) => sum + r.duration, 0);
    const avgSeconds = completed.length ? Math.round(totalSeconds / completed.length) : 0;

    const active = rows.find((r) => r.status === 'Active') ?? null;

    return {
        total: rows.length,
        hosted,
        cohosted,
        attended,
        totalSeconds,
        avgSeconds,
        active,
    };
}
