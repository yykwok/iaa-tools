import { AdError, collectSlots, fetchJSON, findOne, requiredId } from './shared.mjs';

const adTypes = ['rewarded', 'interstitial', 'banner'];

export async function createUnity(input, env) {
    if (!/^\d+$/.test(env.UNITY_ORG_ID || '') || !env.UNITY_KEY_ID || !env.UNITY_SECRET_KEY) {
        throw new AdError('Cloudflare 尚未配置 Unity Ads 发布商凭据。', 503);
    }
    const base = `https://services.api.unity.com/ads/publisher/public/v1/organizations/${env.UNITY_ORG_ID}`;
    const headers = {
        Authorization: 'Basic ' + btoa(`${env.UNITY_KEY_ID}:${env.UNITY_SECRET_KEY}`),
        'Content-Type': 'application/json',
    };
    const call = (path, body) => fetchJSON('Unity Ads', base + path, body
        ? { method: 'POST', headers, body: JSON.stringify(body) }
        : { headers });

    const platform = input.platform === 'ios' ? 'iOS' : 'Android';
    const apps = await call('/applications');
    if (!Array.isArray(apps)) throw new AdError('Unity Ads 未返回应用列表，已暂停创建。');
    const named = app => app.name?.toLowerCase() === input.app_name.toLowerCase();
    const samePlatform = apps.filter(app => app.platform?.toLowerCase() === input.platform);
    const app = findOne(samePlatform, candidate => input.storeId ? candidate.storeId === input.storeId : named(candidate), ' Unity Ads 应用');
    if (!app && input.storeId && samePlatform.some(named)) {
        throw new AdError('Unity Ads 已有同系统同名应用，请核对商店链接。', 409);
    }
    const otherPlatform = input.platform === 'ios' ? 'android' : 'ios';
    const otherApp = app ? null : findOne(apps, candidate => candidate.platform?.toLowerCase() === otherPlatform &&
        named(candidate) && candidate.projectId, ' Unity 跨系统项目');
    const created = app || await call('/applications', {
        name: input.app_name, platform, privacy: { coppa: input.coppa === 1, mixedAudience: false },
        ...(otherApp ? { projectId: otherApp.projectId } : { projectName: input.app_name }),
        ...(input.download_url ? { storeId: input.storeId, store: input.platform === 'ios' ? 'AppleAppStore' : 'GooglePlay' } : {}),
    });
    const id = requiredId(created?.id, 'Unity Application ID');
    const gameId = requiredId(created?.gameId, 'Unity Game ID');
    const path = `/applications/${encodeURIComponent(id)}/placements`;

    async function listBidders() {
        const rows = await call('/placements');
        if (!Array.isArray(rows)) throw new AdError('Unity Ads 未返回可核对的组织广告位列表。');
        return rows.filter(row => row.placementType === 'bidding' &&
            String(row.gameId) === gameId && row.platform?.toLowerCase() === input.platform);
    }

    const [bidders, current] = await Promise.all([listBidders(), call(path + '?isArchived=false')]);
    if (!Array.isArray(current)) throw new AdError('Unity Ads 未返回可查重的应用广告位列表。');
    const placements = await collectSlots(async (name, index) => {
        const adFormat = adTypes[index];
        const names = [name, `${created.name || input.app_name}_${adFormat}`];
        const candidates = bidders.filter(row => row.adFormat === adFormat);
        const exact = findOne(candidates, row => names.includes(row.name), ' Unity 竞价广告位');
        const slot = exact || findOne(candidates, () => true, ' Unity 竞价广告位');
        if (slot) return { id: requiredId(slot.placementId, 'Unity Placement ID'), name: slot.name, status: 'existing' };
        if (current.some(row => row.adFormat === adFormat && names.includes(row.name))) {
            throw new AdError('已有同名广告位，未确认其竞价状态。请在 Unity 控制台核对。');
        }

        const placement = await call(path, { name, adFormat });
        return { id: requiredId(placement?.key, 'Unity Placement ID'), name, status: 'pending' };
    });

    if (Object.values(placements).some(slot => slot.status === 'pending')) {
        const verified = await listBidders().catch(() => []);
        for (const slot of Object.values(placements)) {
            if (slot.status !== 'pending') continue;
            if (verified.some(row => row.placementId === slot.id)) {
                slot.status = 'created';
            } else {
                delete slot.id;
                slot.status = 'failed';
                slot.message = '已提交创建，竞价状态尚未确认。请在 Unity 控制台核对。';
            }
        }
    }

    return { unity_app_id: id, unity_game_id: gameId, app_name: created.name || input.app_name, is_app_exists: Boolean(app), placements };
}
