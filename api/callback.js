export default async function handler(req, res) {
  const code = req.query.code;
  const SB_URL = 'https://xfwsnshhlfjzflobuoxd.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmd3Nuc2hobGZqemZsb2J1b3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODg2NDUsImV4cCI6MjA5NDI2NDY0NX0.gZnNb3EEEy9H3ZZ-B-1lSSSbbldJkIuS0zcFmT6Wjec';

  if (!code) return res.redirect('/?auth_error=no_code');

  try {
    // Exchange code for session server-side — bypasses Chrome bounce tracking
    const tokenRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      body: JSON.stringify({ auth_code: code })
    });
    const data = await tokenRes.json();

    if (data.access_token) {
      // Redirect back with tokens as query params — direct navigation, not bounce
      const redirect = `/?at=${encodeURIComponent(data.access_token)}&rt=${encodeURIComponent(data.refresh_token || '')}&uid=${encodeURIComponent(data.user?.id || '')}`;
      return res.redirect(redirect);
    }
  } catch(e) {
    console.error('[mocha/callback]', e.message);
  }

  return res.redirect('/?auth_error=exchange_failed');
}
