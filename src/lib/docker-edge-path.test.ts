import { describe, expect, test } from 'vitest';
import { isBlockedEdgePath } from '../../docker/edge-path.mjs';

describe('isBlockedEdgePath', () => {
  test('allows normal application and marketing paths', () => {
    expect(isBlockedEdgePath('/')).toBe(false);
    expect(isBlockedEdgePath('/app')).toBe(false);
    expect(isBlockedEdgePath('/pricing')).toBe(false);
    expect(isBlockedEdgePath('/sitemap.xml')).toBe(false);
    expect(isBlockedEdgePath('/blog/tracky-v0-1-0')).toBe(false);
    expect(isBlockedEdgePath('/docs/cdn-cgi')).toBe(false);
    expect(isBlockedEdgePath('/cdn-cginfo')).toBe(false);
    expect(isBlockedEdgePath('/app?next=/cdn-cgi/local/scheduled')).toBe(false);
    expect(isBlockedEdgePath(undefined)).toBe(false);
    expect(isBlockedEdgePath('')).toBe(false);
  });

  test('blocks /cdn-cgi paths regardless of case or query string', () => {
    expect(isBlockedEdgePath('/cdn-cgi')).toBe(true);
    expect(isBlockedEdgePath('/cdn-cgi/')).toBe(true);
    expect(isBlockedEdgePath('/cdn-cgi/local/platform-proxy')).toBe(true);
    expect(isBlockedEdgePath('/cdn-cgi/local/scheduled')).toBe(true);
    expect(isBlockedEdgePath('/cdn-cgi/mf/scheduled')).toBe(true);
    expect(isBlockedEdgePath('/cdn-cgi/local/email')).toBe(true);
    expect(isBlockedEdgePath('/CDN-CGI/local/email')).toBe(true);
    expect(isBlockedEdgePath('/Cdn-Cgi/Local/Scheduled?cron=*')).toBe(true);
    expect(isBlockedEdgePath('/cdn-cgi?x=1')).toBe(true);
  });

  test('blocks percent-encoded, double-slash, backslash, and dot-segment variants', () => {
    expect(isBlockedEdgePath('/%63dn-cgi/local/scheduled')).toBe(true);
    expect(isBlockedEdgePath('/%43%44%4E%2D%43%47%49/local/email')).toBe(true);
    expect(isBlockedEdgePath('/cdn%2dcgi/local/platform-proxy')).toBe(true);
    expect(isBlockedEdgePath('/cdn-cgi%2flocal%2fscheduled')).toBe(true);
    expect(isBlockedEdgePath('/%2563dn-cgi/local/scheduled')).toBe(true);
    expect(isBlockedEdgePath('//cdn-cgi/local/scheduled')).toBe(true);
    expect(isBlockedEdgePath('///CDN-CGI//local/platform-proxy')).toBe(true);
    expect(isBlockedEdgePath('/\\cdn-cgi/local/email')).toBe(true);
    expect(isBlockedEdgePath('/foo/../cdn-cgi/local/scheduled')).toBe(true);
    expect(isBlockedEdgePath('/./cdn-cgi/local/platform-proxy')).toBe(true);
    expect(isBlockedEdgePath('/foo/%2e%2e/%63dn-cgi/local/scheduled')).toBe(
      true,
    );
    expect(isBlockedEdgePath('/cdn-cgi/%ZZ')).toBe(true);
    expect(isBlockedEdgePath('http://localhost:3000/cdn-cgi/local/email')).toBe(
      true,
    );
  });
});
