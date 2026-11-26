import { AdError, bearerOptions, collectSlots, fetchJSON, fetchResponse, findOne, requiredId } from './shared.mjs';
import { storeIdFromURL } from './input.mjs';

const service = 'Liftoff';
const base = 'https://publisher-api.vungle.com/api/v1';
const adTypes = ['rewarded', 'interstitial', 'banner'];

export async function createLiftoff(input, env) {
    if (!env.LIFTOFF_SECRET_TOKEN) throw new AdError('Cloudflare 尚未配置 Liftoff Secret Token。', 503);
    const auth = await fetchJSON(service, 'https://auth-api.vungle.com/v2/auth', {
        headers: { 'x-api-key': env.LIFTOFF_SECRET_TOKEN },
    });
    const token = requiredId(auth?.token, 'Liftoff 授权令牌');

    async function list(resource, filters) {
        const rows = [];
        for (let page = 1; page <= 20; page++) {
            const query = new URLSearchParams({ ...filters, page, per_page: 100 });
            const response = await fetchResponse(service, `${base}/${resource}?${query}`, bearerOptions(token));
            const items = await response.json().catch(() => null);
            if (!Array.isArray(items)) break;
            rows.push(...items);
            const pages = Number(response.headers.get('Vungle-Pagination-Pages')) || 0;
            if ((pages && page >= pages) || (!pages && items.length < 100)) return rows;
        }
        throw new AdError('Liftoff 未返回完整列表，已暂停创建。');
    }

    const apps = (await list('applications', { platform: input.platform })).filter(app => app.platform === input.platform);
    const app = findOne(apps, row => input.storeId
        ? String(row.store?.id) === input.storeId || storeIdFromURL(row.store?.url, input.platform) === input.storeId
        : row.name === input.app_name, ' Liftoff 应用');
    if (!app && apps.some(row => row.name === input.app_name)) {
        throw new AdError('Liftoff 已有同系统同名应用，请核对商店链接。', 409);
    }
    if (!app && input.download_url && !input.taxonomy) throw new AdError('创建已上架的 Liftoff 应用需要填写商店分类。', 400);
    const created = app || await fetchJSON(service, base + '/applications', bearerOptions(token, {
        name: input.app_name, platform: input.platform, isCoppa: input.coppa === 1,
        ...(input.download_url ? {
            store: { id: input.storeId, category: input.taxonomy, isManual: false, url: input.download_url },
        } : {}),
    }));
    const appId = requiredId(created?.vungleAppId || created?.id, 'Liftoff App ID');
    const parentId = created.id || appId;
    const current = await list('placements', { application: parentId, archived: 'false' });
    const bidding = input.mode === 'bidding';
    const placements = await collectSlots(async (name, index) => {
        const type = adTypes[index];
        const preferredName = bidding ? name : `${name}_Waterfall`;
        const names = [preferredName, `${created.name || input.app_name}_${['reward', 'inter', 'banner'][index]}`];
        const slot = findOne(current, row => names.includes(row.name) && row.type === type &&
            !row.archived && Boolean(row.isHBParticipation) === bidding, ' Liftoff 广告位');
        const placement = slot || await fetchJSON(service, base + '/placements', bearerOptions(token, {
            application: parentId, name: preferredName, type, isHBParticipation: bidding,
        }));
        const id = requiredId(placement?.referenceID, 'Liftoff Reference ID');
        return { id, name: placement.name || name, status: slot ? 'existing' : 'created' };
    });
    return { vungle_app_id: appId, app_name: created.name || input.app_name, is_app_exists: Boolean(app), placements };
}
