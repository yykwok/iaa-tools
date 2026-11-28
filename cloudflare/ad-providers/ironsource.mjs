import { AdError, bearerOptions, collectSlots, fetchJSON, findOne, requiredId } from './shared.mjs';

const service = 'ironSource Ads';
const base = 'https://platform.ironsrc.com';
const appPath = base + '/partners/publisher/applications/v6';
const adUnits = ['rewardedVideo', 'interstitial', 'banner'];

export async function createIronSource(input, env) {
    if (!env.IRONSOURCE_SECRET_KEY || !env.IRONSOURCE_REFRESH_TOKEN) {
        throw new AdError('Cloudflare 尚未配置 ironSource Ads 发布商凭据。', 503);
    }
    const token = await fetchJSON(service, base + '/partners/publisher/auth', {
        headers: { secretkey: env.IRONSOURCE_SECRET_KEY, refreshToken: env.IRONSOURCE_REFRESH_TOKEN },
    });
    if (typeof token !== 'string' || !token.trim()) throw new AdError('ironSource Ads 未返回可用的授权令牌。');
    const platform = input.platform === 'ios' ? 'iOS' : 'Android';
    const sameApp = app => app.platform?.toLowerCase() === input.platform && (input.storeId
        ? String(input.platform === 'ios' ? app.trackId : app.bundleId) === input.storeId
        : app.appName === input.app_name);

    async function findApp() {
        const apps = await fetchJSON(service, appPath, bearerOptions(token));
        if (!Array.isArray(apps)) throw new AdError('ironSource Ads 未返回应用列表，已暂停创建。');
        const app = findOne(apps, sameApp, ' ironSource Ads 应用');
        if (!app && input.storeId && apps.some(row =>
            row.platform?.toLowerCase() === input.platform && row.appName === input.app_name)) {
            throw new AdError('ironSource Ads 已有同系统同名应用，请核对商店链接。', 409);
        }
        return app;
    }

    let app = await findApp();
    const existing = Boolean(app);
    if (!app) {
        if (input.download_url && !input.taxonomy) throw new AdError('创建已上架的 ironSource 应用需要填写应用分类。', 400);
        const body = {
            appName: input.app_name,
            coppa: input.coppa,
            ccpa: input.ccpa,
            adUnits: { RewardedVideo: 'Live', Interstitial: 'Live', Banner: 'Live' },
            ...(input.download_url ? { storeUrl: input.download_url, taxonomy: input.taxonomy } : { platform }),
        };
        await fetchJSON(service, appPath, bearerOptions(token, body));
        app = await findApp();
    }
    const appKey = requiredId(app?.appKey, 'ironSource App Key');
    const path = `${base}/ads/instances/v1/${encodeURIComponent(appKey)}/`;

    async function listInstances() {
        const instances = await fetchJSON(service, path, bearerOptions(token));
        if (!Array.isArray(instances)) throw new AdError('ironSource Ads 未返回可核对的实例列表。');
        return instances;
    }

    const current = await listInstances();
    const placements = await collectSlots(async (name, index) => {
        const adUnit = adUnits[index];
        if (input.mode === 'bidding') {
            const bidder = findOne(current, instance => instance.adUnit === adUnit && instance.isBidder === true, '竞价实例');
            if (!bidder) throw new AdError('请在 ironSource Ads 后台核对该格式的竞价实例。');
            const status = bidder.isLive === true ? 'existing' : 'inactive';
            return { id: requiredId(bidder.instanceId, 'ironSource Instance ID'), name: bidder.instanceName || name, status };
        }
        const matching = instance => instance.adUnit === adUnit && instance.instanceName === name && instance.isBidder !== true;
        const existingInstance = findOne(current, matching, '传统广告实例');
        if (!existingInstance) await fetchJSON(service, path, bearerOptions(token, [{ instanceName: name, adUnit, isLive: false }]));
        const instance = existingInstance || findOne(await listInstances(), matching, '传统广告实例');
        const status = instance?.isLive === true ? 'existing' : 'inactive';
        return { id: requiredId(instance?.instanceId, 'ironSource Instance ID'), name, status };
    });
    return { app_id: appKey, app_name: app.appName || input.app_name, is_app_exists: existing, placements };
}
