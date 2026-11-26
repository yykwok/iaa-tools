import { AdError } from './shared.mjs';

const androidPackage = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const appleStoreId = /^\d{1,20}$/;
const pangleCategories = new Set([120400, 120401, 120402, 120403]);

export function storeIdFromURL(text, platform) {
    const url = URL.parse(text);
    if (!url || url.protocol !== 'https:' || url.port || url.username || url.password) return '';
    if (platform === 'ios' && url.hostname === 'apps.apple.com') {
        return url.pathname.match(/\/id(\d{1,20})\/?$/)?.[1] || '';
    }
    if (platform === 'android' && url.hostname === 'play.google.com' && url.pathname === '/store/apps/details') {
        const ids = url.searchParams.getAll('id');
        if (ids.length === 1 && androidPackage.test(ids[0])) return ids[0];
    }
    return '';
}

export function validateInput(data, provider) {
    const app_name = typeof data?.app_name === 'string' ? data.app_name.trim() : '';
    const platform = data?.platform;
    if (!app_name || app_name.length > 80 || !['ios', 'android'].includes(platform)) {
        throw new AdError('请填写有效的应用名称和目标平台。', 400);
    }

    const download_url = typeof data.download_url === 'string' ? data.download_url.trim() : '';
    let storeId = '';
    if (download_url) {
        storeId = storeIdFromURL(download_url, platform);
        if (!storeId || download_url.length > 2048) {
            throw new AdError('商店链接须与所选平台一致，请使用 App Store 或 Google Play 的应用链接。', 400);
        }
    }

    const input = { app_name, platform, download_url, storeId };
    if (provider === 'admob') {
        if (storeId && data.link_store !== 'yes') {
            throw new AdError('请确认 AdMob 应用的商店关联。', 400);
        }
        return input;
    }

    const needsMode = ['mintegral', 'ironsource', 'liftoff'].includes(provider);
    if (!['0', '1'].includes(data.coppa) || (needsMode && !['bidding', 'traditional'].includes(data.mode))) {
        throw new AdError('请选择 COPPA 设置和广告位类型。', 400);
    }
    Object.assign(input, { coppa: Number(data.coppa), mode: data.mode });
    if (provider === 'pangle') {
        const app_category_code = Number(data.app_category_code);
        if (!download_url || !pangleCategories.has(app_category_code)) {
            throw new AdError('Pangle 需要上架商店链接和应用类别。', 400);
        }
        input.app_category_code = app_category_code;
    }
    if (provider === 'mintegral' && !storeId) {
        const manualId = (typeof data.store_id === 'string' ? data.store_id.trim() : '').replace(/^id(?=\d+$)/i, '');
        if (manualId.length > 200 || !(platform === 'ios' ? appleStoreId : androidPackage).test(manualId)) {
            throw new AdError('未提供商店链接时，请填写有效的 App Store ID 或 Google Play 包名。', 400);
        }
        input.storeId = manualId;
    }
    if (provider === 'ironsource') {
        const taxonomy = typeof data.taxonomy === 'string' ? data.taxonomy.trim() : '';
        if (taxonomy.length > 100 || !['0', '1'].includes(data.ccpa)) {
            throw new AdError('请核对应用分类和 CCPA 设置。', 400);
        }
        input.taxonomy = taxonomy;
        input.ccpa = Number(data.ccpa);
    }
    if (provider === 'liftoff') {
        input.taxonomy = typeof data.taxonomy === 'string' ? data.taxonomy.trim() : '';
        if (input.taxonomy.length > 100) throw new AdError('请核对 Liftoff 应用分类。', 400);
    }
    return input;
}
