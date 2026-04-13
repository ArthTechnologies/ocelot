import { env } from '$env/dynamic/public';

/**
 * Site URL for analytics reporting
 * Defaults to https://arthmc.xyz if not set in environment
 */
export const SITE_URL = env.PUBLIC_SITE_URL || 'https://arthmc.xyz';
