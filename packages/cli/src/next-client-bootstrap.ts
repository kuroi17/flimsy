/**
 * Tiny zero-config browser bootstrap automatically prepended to Next.js dev client entries.
 * Never included in `next build` production bundles.
 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const w = window as any;
  if (!w.__FLIMSY_NEXT_BOOTSTRAPPED__) {
    w.__FLIMSY_NEXT_BOOTSTRAPPED__ = true;
    const baseUrl =
      (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_FLIMSY_URL) ||
      'http://127.0.0.1:4193';
    const script = document.createElement('script');
    script.type = 'module';
    script.src = baseUrl.replace(/\/$/, '') + '/@flimsy/client.js';
    (document.head || document.documentElement).appendChild(script);
  }
}
