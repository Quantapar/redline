import { signIn } from '@/auth';
import { viewerGithub } from '@/lib/github-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /connect/github
 *
 * The onboarding's "Connect GitHub" button opens this in a new tab. Signed out,
 * it starts GitHub sign-in and comes back here; signed in, it tells the
 * onboarding tab which GitHub account connected (over a same-origin
 * BroadcastChannel) and closes itself, so the onboarding can list that
 * account's repositories without anyone pasting a username.
 */
export async function GET() {
  const viewer = await viewerGithub().catch(() => null);
  if (!viewer) {
    // Throws Next's redirect to GitHub; GitHub sends the visitor back here
    await signIn('github', { redirectTo: '/connect/github' });
    return new Response(null, { status: 204 });
  }

  // JSON-encode, then escape '<' so a login can never close the script tag
  const payload = JSON.stringify({ type: 'github-connected', login: viewer.login }).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GitHub connected · Redline</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: oklch(0.145 0 0); color: oklch(0.92 0 0);
         font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { text-align: center; padding: 24px; }
  p { margin: 0; color: oklch(0.7 0 0); }
  strong { color: oklch(0.96 0 0); font-weight: 500; }
  a { color: inherit; }
</style>
</head>
<body>
<main>
  <p><strong>GitHub connected.</strong></p>
  <p>Head back to the Redline tab to pick a repository. <a href="/">Or continue here</a>.</p>
</main>
<script>
  (function () {
    var msg = ${payload};
    try { new BroadcastChannel('redline-github').postMessage(msg); } catch (e) {}
    try { if (window.opener && window.opener.location.origin === location.origin) window.opener.postMessage(msg, location.origin); } catch (e) {}
    setTimeout(function () { window.close(); }, 600);
  })();
</script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
