import { AdError, collectSlots, fetchJSON, findOne, requiredId } from './shared.mjs';
import { storeIdFromURL } from './input.mjs';

const slotTypes = [
    { suffix: 'reward', type: 5, fields: { orientation: 1, reward_name: 'Coins', reward_count: 1, reward_is_callback: 0 } },
    { suffix: 'inter', type: 6, fields: { orientation: 1 } },
    { suffix: 'banner', type: 2, fields: { slide_banner: 1, width: 640, height: 100 } },
];

export async function createPangle(input, env) {
    const userId = Number(env.PANGLE_USER_ID);
    const roleId = Number(env.PANGLE_ROLE_ID);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(roleId) || roleId <= 0 || !env.PANGLE_SECURITY_KEY) {
        throw new AdError('Cloudflare 尚未配置 Pangle 发布商凭据。', 503);
    }

    async function call(path, fields) {
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = 100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000;
        const signBytes = await crypto.subtle.digest('SHA-1',
            new TextEncoder().encode([env.PANGLE_SECURITY_KEY, String(timestamp), String(nonce)].sort().join('')));
        const sign = Array.from(new Uint8Array(signBytes), byte => byte.toString(16).padStart(2, '0')).join('');
        const result = await fetchJSON('Pangle', `https://open-api.pangleglobal.com/union/media/open_api/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, role_id: roleId, timestamp, nonce, sign, version: '1.0', ...fields }),
        });
        if (result?.code === 50007) throw new AdError('Pangle 正在异步校验商店链接，请等待平台审核结果再重试。');
        if (result?.code !== 0 || !result.data) {
            throw new AdError(`Pangle 请求未完成${Number.isInteger(result?.code) ? `（${result.code}）` : ''}。`);
        }
        return result.data;
    }

    async function list(path, key, fields) {
        const rows = [];
        for (let page = 1; page <= 20; page++) {
            const result = await call(path, { ...fields, page, page_size: 100 });
            if (page === 1 && result[key] == null && result.page_info?.total_number === 0) return [];
            if (!Array.isArray(result[key])) break;
            rows.push(...result[key]);
            if (page >= (result.page_info?.total_page ?? (result[key].length < 100 ? page : Infinity))) return rows;
        }
        throw new AdError('Pangle 未返回完整列表，已暂停创建。');
    }

    const applications = await list('site/query', 'app_list', {
        app_name: [input.app_name], os_type: [input.platform],
    });
    const samePlatform = applications.filter(app => app.app_name === input.app_name && app.os_type?.toLowerCase() === input.platform);
    const app = findOne(samePlatform, value => storeIdFromURL(value.download_url, input.platform) === input.storeId ||
        (input.platform === 'android' && value.package_name === input.storeId), ' Pangle 应用');
    if (!app && samePlatform.length) throw new AdError('Pangle 已有同系统同名应用，请核对商店链接。', 409);

    const created = app || await call('site/create', {
        status: 2, app_name: input.app_name, app_category_code: input.app_category_code,
        download_url: input.download_url, coppa_value: input.coppa,
    });
    const appId = requiredId(created.app_id, 'Pangle App ID');
    const current = await list('code/query', 'ad_slot_list', { app_id: [Number(appId)] });
    const placements = await collectSlots(async (_, index) => {
        const { suffix, type, fields } = slotTypes[index];
        const name = `${input.app_name}_${suffix}`;
        const slot = findOne(current, row => row.ad_slot_name === name && Number(row.ad_slot_type) === type, ' Pangle 广告位');
        const placement = slot || await call('code/create', {
            app_id: Number(appId), ad_slot_name: name, ad_slot_type: type, render_type: 1, ...fields,
        });
        return { id: requiredId(placement.ad_slot_id, 'Pangle Ad Slot ID'), name, status: slot ? 'existing' : 'created' };
    });
    return { pangle_app_id: appId, app_name: input.app_name, is_app_exists: Boolean(app), platform_verified: true, slots: placements };
}
