const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const gatewayTarget =
    process.env.GATEWAY_PROXY_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_GATEWAY_API_URL?.replace(/\/$/, '') ||
    'https://gateway.hallaai.com';

/** WebSockets cannot use Vercel rewrites — default to Render gateway WS in production builds. */
const gatewayWsTarget =
    process.env.NEXT_PUBLIC_GATEWAY_WS_URL?.replace(/\/$/, '') ||
    gatewayTarget.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

/** Local dev only: proxy /api/v1 through Next (GATEWAY_PROXY_URL). Production hits Render directly — CORS is configured on the gateway. */
const useSameOriginApi =
    Boolean(process.env.GATEWAY_PROXY_URL) ||
    process.env.NEXT_PUBLIC_USE_SAME_ORIGIN_API === 'true';

const nextConfig = {
    env: {
        NEXT_PUBLIC_USE_SAME_ORIGIN_API: useSameOriginApi ? 'true' : '',
        NEXT_PUBLIC_GATEWAY_API_URL: gatewayTarget,
        NEXT_PUBLIC_GATEWAY_WS_URL: gatewayWsTarget,
        NEXT_PUBLIC_BUILD_ID:
            process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
            process.env.VERCEL_DEPLOYMENT_ID?.slice(0, 12) ||
            'local',
    },
    // Enable experimental features for performance
    experimental: {
        // Temporarily disable optimizePackageImports to avoid dev runtime
        // module resolution issues in the app router.
        // optimizePackageImports: ['lucide-react', 'framer-motion', '@radix-ui/react-icons'],
        // CSS optimization disabled - requires critters package
        // optimizeCss: true,
    },

    // Compiler optimizations
    compiler: {
        // Remove console.log in production
        removeConsole: process.env.NODE_ENV === 'production' ? {
            exclude: ['error', 'warn'],
        } : false,
    },

    // Image optimization
    images: {
        formats: ['image/avif', 'image/webp'],
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '*.supabase.co',
            },
            {
                protocol: 'https',
                hostname: 'cdn.simpleicons.org',
            },
            {
                protocol: 'https',
                hostname: 'www.google.com',
            },
        ],
    },

    // Enable compression
    compress: true,

    // Production optimizations
    productionBrowserSourceMaps: false,

    async redirects() {
        return [
            { source: '/roi-calculator', destination: '/roi', permanent: true },
            { source: '/:locale/dashboard/knowledge', destination: '/:locale/dashboard/business-profile', permanent: true },
            { source: '/:locale/dashboard/crm/contacts', destination: '/:locale/dashboard/leads', permanent: true },
            { source: '/:locale/dashboard/crm/companies', destination: '/:locale/dashboard/leads', permanent: true },
            { source: '/:locale/dashboard/crm/deals', destination: '/:locale/dashboard/leads', permanent: true },
        ];
    },

    // Dev: set GATEWAY_PROXY_URL=http://localhost:3003. Vercel: auto-proxy to Render (see useSameOriginApi).
    async rewrites() {
        if (!useSameOriginApi) {
            return [];
        }
        return [
            {
                source: '/api/v1/:path*',
                destination: `${gatewayTarget}/api/v1/:path*`,
            },
            {
                source: '/health',
                destination: `${gatewayTarget}/health`,
            },
        ];
    },

    // Headers for caching and security
    async headers() {
        const isDev = process.env.NODE_ENV !== 'production';
        // Allow the local gateway origin whenever the app is actually configured to
        // talk to one — dev mode, or a production build pointed at a local gateway
        // for E2E/CI (NEXT_PUBLIC_GATEWAY_API_URL=http://127.0.0.1:3003). Checking
        // NODE_ENV alone missed the latter case, breaking every gateway fetch under
        // CSP in CI's production-mode Playwright job.
        const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_API_URL || '';
        const usesLocalGateway = isDev || /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(gatewayUrl);
        const localGatewayConnect = usesLocalGateway
            ? ' http://127.0.0.1:3003 http://localhost:3003 ws://127.0.0.1:3003 ws://localhost:3003'
            : '';
        // Tawk.to live chat widget — script, websocket, and its embedded iframe.
        const tawkScriptSrc = ' https://embed.tawk.to';
        const tawkConnectSrc = ' https://*.tawk.to wss://*.tawk.to';
        const tawkFrameSrc = ' https://*.tawk.to';
        // Tawk's widget (rendered inside an about:blank iframe that inherits our
        // CSP) loads its own stylesheet from embed.tawk.to plus Google Fonts —
        // without these in style-src/font-src, the widget's CSS silently fails
        // to load and it renders as an empty, unstyled shell.
        const tawkStyleSrc = ' https://embed.tawk.to https://fonts.googleapis.com';
        const tawkFontSrc = ' https://fonts.gstatic.com';
        const connectSrc = `'self' https://gateway.hallaai.com https://*.supabase.co wss://gateway.hallaai.com wss://*.supabase.co${tawkConnectSrc}${localGatewayConnect}`;
        // Marketing page's Tabler icon webfont is loaded from jsDelivr.
        const jsdelivrSrc = ' https://cdn.jsdelivr.net';

        /** Marketing SPA is embedded in an iframe on `/` — must allow same-origin framing. */
        const marketingSpaCsp = [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline' 'unsafe-eval'${tawkScriptSrc}`,
            `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${tawkStyleSrc}${jsdelivrSrc}`,
            `font-src 'self' https://fonts.gstatic.com data:${tawkFontSrc}${jsdelivrSrc}`,
            "img-src 'self' data: https:",
            "media-src 'self' blob:",
            `connect-src ${connectSrc}`,
            `frame-src 'self'${tawkFrameSrc}`,
            "frame-ancestors 'self'",
        ].join('; ');

        const appCsp = [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline' 'unsafe-eval'${tawkScriptSrc}`,
            `style-src 'self' 'unsafe-inline'${tawkStyleSrc}${jsdelivrSrc}`,
            `font-src 'self' data:${tawkFontSrc}${jsdelivrSrc}`,
            "img-src 'self' data: https:",
            "media-src 'self' blob:",
            `connect-src ${connectSrc}`,
            `frame-src 'self'${tawkFrameSrc}`,
            "frame-ancestors 'none'",
        ].join('; ');

        const commonHeaders = [
            { key: 'X-DNS-Prefetch-Control', value: 'on' },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            {
                key: 'Permissions-Policy',
                value: 'camera=(), microphone=(), geolocation=()',
            },
        ];

        return [
            {
                source: '/:path*',
                headers: [
                    ...commonHeaders,
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'Content-Security-Policy', value: appCsp },
                ],
            },
            // Later rule wins for duplicate keys — overrides DENY for the landing iframe document.
            {
                source: '/index.html',
                headers: [
                    ...commonHeaders,
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'Content-Security-Policy', value: marketingSpaCsp },
                    { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
                ],
            },
        ];
    },
};

module.exports = withNextIntl(nextConfig);
