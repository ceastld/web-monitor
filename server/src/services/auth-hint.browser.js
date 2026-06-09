/** Detect whether the current page looks like a login / auth wall. */
export function analyzeAuthHint(expectedUrl) {
  const pageUrl = window.location.href;
  const pageTitle = (document.title || "").trim();
  const path = window.location.pathname.toLowerCase();

  const loginPath = /\/(login|signin|sign-in|sign_in|auth|oauth|session|authenticate|sso)(\/|$)/i.test(
    path,
  );
  const loginTitle = /login|sign\s*in|authenticate|authorization|登录|登入|验证身份/i.test(pageTitle);
  const hasPassword = Boolean(document.querySelector('input[type="password"]'));
  const hasLoginForm = Boolean(
    document.querySelector(
      'form[action*="login"], form[action*="signin"], form[action*="sign-in"], form[action*="auth"]',
    ),
  );
  const hasOAuthButton = Boolean(
    document.querySelector(
      'button[data-provider], a[href*="oauth"], a[href*="login"], button:has(svg)',
    ),
  );

  let hostChanged = false;
  let pathChanged = false;
  try {
    const expected = new URL(expectedUrl);
    const current = new URL(pageUrl);
    hostChanged = expected.host !== current.host;
    const normalize = (value) => value.replace(/\/$/, "") || "/";
    pathChanged = normalize(expected.pathname) !== normalize(current.pathname);
  } catch {
    // ignore invalid URL
  }

  const score = [
    loginPath,
    loginTitle,
    hasPassword,
    hasLoginForm,
    hostChanged && (loginPath || hasPassword),
    pathChanged && loginPath,
    hasOAuthButton && hasPassword,
  ].filter(Boolean).length;

  return {
    likely_auth_failure: score >= 2 || (hasPassword && (loginPath || loginTitle)),
    page_url: pageUrl,
    page_title: pageTitle,
    signals: {
      loginPath,
      loginTitle,
      hasPassword,
      hasLoginForm,
      hostChanged,
      pathChanged,
    },
  };
}
