import { PUBLIC_SITE_URL } from '$env/static/public';

/**
 * Site URL for analytics reporting
 * Defaults to https://arthmc.xyz if not set in environment
 */
export const SITE_URL = PUBLIC_SITE_URL || 'https://arthmc.xyz';
