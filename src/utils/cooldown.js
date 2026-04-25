const cooldowns = new Map();

export function isOnCooldown(userId, commandName, durationMs) {
const key = `${userId}:${commandName}`;
const now = Date.now();
const expiry = cooldowns.get(key);

if (expiry && now < expiry) {
return Math.ceil((expiry - now) / 1000);
}

cooldowns.set(key, now + durationMs);
return false;
}