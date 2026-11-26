import { AdError, bearerOptions, collectSlots, fetchJSON, findOne, requiredId } from './shared.mjs';

const service = 'AdMob';
const adFormats = ['REWARDED', 'INTERSTITIAL', 'BANNER'];

export async function createAdMob(input, env) {
    const account = env.ADMOB_PUBLISHER_ID;
    if (!/^pub-\d{16}$/.test(account || '') ||
        !env.ADMOB_CLIENT_ID || !env.ADMOB_CLIENT_SECRET || !env.ADMOB_REFRESH_TOKEN) {
        throw new AdError('Cloudflare 尚未配置 AdMob 发布商凭据。', 503);
    }
    const oauth = await fetchJSON(service, 'https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: env.ADMOB_CLIENT_ID,
            client_secret: env.ADMOB_CLIENT_SECRET,
            refresh_token: env.ADMOB_REFRESH_TOKEN,
        }),
    });
    const token = requiredId(oauth?.access_token, 'OAuth token');
    const base = `https://admob.googleapis.com/v1beta/accounts/${account}`;
    const appPlatform = input.platform.toUpperCase();

    async function list(resource) {
        const items = [];
        let next;
        for (let page = 0; page < 25; page++) {
            const query = new URLSearchParams({ pageSize: '1000' });
            if (next) query.set('pageToken', next);
            const data = await fetchJSON(service, `${base}/${resource}?${query}`, bearerOptions(token));
            if (!data || (data[resource] !== undefined && !Array.isArray(data[resource]))) break;
            items.push(...(data[resource] || []));
            next = data.nextPageToken;
            if (!next) return items;
        }
        throw new AdError('AdMob 未返回完整列表，已暂停创建。');
    }

    const apps = (await list('apps')).filter(app => app.platform === appPlatform);
    const named = app => app.manualAppInfo?.displayName === input.app_name || app.linkedAppInfo?.displayName === input.app_name;
    let app = findOne(apps, candidate => input.storeId
        ? candidate.linkedAppInfo?.appStoreId === input.storeId
        : named(candidate), ' AdMob 应用');
    const existing = Boolean(app);
    if (!app) {
        if (input.storeId && apps.some(named)) {
            throw new AdError('AdMob 已有同名应用，请先核对商店链接或使用已有应用入口。', 409);
        }
        const body = { platform: appPlatform };
        if (input.storeId) {
            body.linkedAppInfo = { appStoreId: input.storeId };
            if (input.platform === 'android') body.linkedAppInfo.androidAppStores = ['GOOGLE_PLAY_APP_STORE'];
        } else {
            body.manualAppInfo = { displayName: input.app_name };
        }
        app = await fetchJSON(service, `${base}/apps`, bearerOptions(token, body));
    }
    const appId = requiredId(app?.appId, 'AdMob App ID');

    const units = (await list('adUnits')).filter(unit => unit.appId === appId);
    const placements = await collectSlots(async (name, index) => {
        const adFormat = adFormats[index];
        const unit = findOne(units, value => value.displayName === name && value.adFormat === adFormat, ' AdMob 广告位');
        const created = unit || await fetchJSON(service, `${base}/adUnits`, bearerOptions(token, {
            appId, displayName: name, adFormat,
            adTypes: adFormat === 'BANNER' ? ['RICH_MEDIA'] : ['RICH_MEDIA', 'VIDEO'],
        }));
        return { id: requiredId(created?.adUnitId, 'AdMob Ad Unit ID'), name, status: unit ? 'existing' : 'created' };
    });
    return { app_id: appId, app_name: app.linkedAppInfo?.displayName || app.manualAppInfo?.displayName || input.app_name, is_app_exists: existing, placements };
}
