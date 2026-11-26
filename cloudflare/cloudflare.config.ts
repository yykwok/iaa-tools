import { bindings, defineConfig, exports, triggers } from 'cf/config';

const name = 'ad-placements';

export default defineConfig({
    worker: {
        name,
        entrypoint: './ad-placements.mjs',
        compatibilityDate: '2026-11-26',
        compatibilityFlags: ['nodejs_compat'],
        workersDev: false,
        previewUrls: false,
        triggers: [triggers.fetch({ pattern: 'hiyyk.com/api/ad-placements/*', zone: 'hiyyk.com' })],
        exports: { AdPlacementLock: exports.durableObject({ storage: 'sqlite' }) },
        env: {
            AD_PLACEMENT_LOCKS: bindings.durableObject({ worker: name, exportName: 'AdPlacementLock' }),
            ACCESS_ISSUER: bindings.secret(),
            ACCESS_AUD: bindings.secret(),
            ADMOB_PUBLISHER_ID: bindings.secret(),
            ADMOB_CLIENT_ID: bindings.secret(),
            ADMOB_CLIENT_SECRET: bindings.secret(),
            ADMOB_REFRESH_TOKEN: bindings.secret(),
            IRONSOURCE_SECRET_KEY: bindings.secret(),
            IRONSOURCE_REFRESH_TOKEN: bindings.secret(),
            LIFTOFF_SECRET_TOKEN: bindings.secret(),
            MINTEGRAL_SKEY: bindings.secret(),
            MINTEGRAL_SECRET: bindings.secret(),
            PANGLE_USER_ID: bindings.secret(),
            PANGLE_ROLE_ID: bindings.secret(),
            PANGLE_SECURITY_KEY: bindings.secret(),
            UNITY_ORG_ID: bindings.secret(),
            UNITY_KEY_ID: bindings.secret(),
            UNITY_SECRET_KEY: bindings.secret(),
        },
        observability: {
            enabled: true,
            redactQueryString: true,
            logs: { enabled: true },
            traces: { enabled: true, headSamplingRate: 0.05 },
        },
    },
});
