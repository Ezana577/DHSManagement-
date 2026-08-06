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
 * Backed by the increment_deployment_counter RPC (see supabase/deployments_schema.sql).
 */
export async function nextDeploymentId(guildId) {
    console.log(`[DHS Deployment DB] nextDeploymentId: calling increment_deployment_counter for guild ${guildId}...`);
    const { data, error } = await supabase.rpc('increment_deployment_counter', { p_guild_id: guildId });
    if (error) {
        console.error('[DHS Deployment DB] nextDeploymentId RPC error (full object):', JSON.stringify(error, null, 2));
        throw error;
    }
    console.log(`[DHS Deployment DB] nextDeploymentId: got counter value ${data}`);
    return `DEP-${String(data).padStart(4, '0')}`;
}

/**
 * Inserts a new deployment row when a deployment starts.
 */
export async function insertDeployment(row) {
    console.log('[DHS Deployment DB] insertDeployment: inserting row:', JSON.stringify(row, null, 2));
    const { data, error } = await supabase.from('deployments').insert(row).select().single();
    if (error) {
        console.error('[DHS Deployment DB] insertDeployment error (full object):', JSON.stringify(error, null, 2));
        throw error;
    }
    console.log(`[DHS Deployment DB] insertDeployment: success, id=${data?.id} deployment_id=${data?.deployment_id}`);
    return data;
}

/**
 * Updates a deployment row by its Discord message ID. Used when a
 * deployment ends, since the message ID is always known to the button handler.
 */
export async function updateDeploymentByMessageId(messageId, updates) {
    console.log(`[DHS Deployment DB] updateDeploymentByMessageId: message_id=${messageId} updates:`, JSON.stringify(updates, null, 2));
    const { data, error } = await supabase
        .from('deployments')
        .update(updates)
        .eq('message_id', messageId)
        .select()
        .maybeSingle();
    if (error) {
        console.error('[DHS Deployment DB] updateDeploymentByMessageId error (full object):', JSON.stringify(error, null, 2));
        throw error;
    }
    if (!data) {
        console.warn(`[DHS Deployment DB] updateDeploymentByMessageId: no row matched message_id=${messageId}. This deployment will NOT show up in status/history.`);
    } else {
        console.log(`[DHS Deployment DB] updateDeploymentByMessageId: success, updated deployment_id=${data.deployment_id}`);
    }
    return data;
}

/**
 * Fetches every deployment where the user was host, co-host, or attendee.
 * Used for computing profile stats. Not paginated — intended for aggregation only.
 */
export async function getDeploymentsForUser(guildId, userId) {
    console.log(`[DHS Deployment DB] getDeploymentsForUser: guild=${guildId} user=${userId}`);
    const { data, error } = await supabase
        .from('deployments')
        .select('*')
        .eq('guild_id', guildId)
        .or(`host_id.eq.${userId},cohost_id.eq.${userId},attendees.cs.{${userId}}`)
        .order('start_time', { ascending: false });
    if (error) {
        console.error('[DHS Deployment DB] getDeploymentsForUser error (full object):', JSON.stringify(error, null, 2));
        throw error;
    }
    console.log(`[DHS Deployment DB] getDeploymentsForUser: found ${data?.length ?? 0} row(s)`);
    return data ?? [];
}

/**
 * Fetches one page of a user's deployment history, newest first.
 */
export async function getDeploymentHistoryPage(guildId, userId, page) {
    const from = page * HISTORY_PAGE_SIZE;
    const to = from + HISTORY_PAGE_SIZE - 1;

    console.log(`[DHS Deployment DB] getDeploymentHistoryPage: guild=${guildId} user=${userId} page=${page} range=[${from},${to}]`);
    const { data, error, count } = await supabase
        .from('deployments')
        .select('*', { count: 'exact' })
        .eq('guild_id', guildId)
        .or(`host_id.eq.${userId},cohost_id.eq.${userId},attendees.cs.{${userId}}`)
        .order('start_time', { ascending: false })
        .range(from, to);

    if (error) {
        console.error('[DHS Deployment DB] getDeploymentHistoryPage error (full object):', JSON.stringify(error, null, 2));
        throw error;
    }
    console.log(`[DHS Deployment DB] getDeploymentHistoryPage: returned ${data?.length ?? 0} row(s), total=${count}`);
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
