import express from 'express';

/** Apply security headers on every response (API + health). */
export function securityHeadersMiddleware(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}

/** Redirect HTTP → HTTPS in production (behind load balancer). */
export function httpsRedirectMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  if (proto === 'http') {
    const host = req.headers.host || '';
    // Express redirect — project Response types omit redirect (fetch Response collision)
    (res as unknown as { redirect: (code: number, url: string) => void }).redirect(
      301,
      `https://${host}${req.originalUrl}`
    );
    return;
  }
  next();
}
