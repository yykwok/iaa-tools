import { createHash } from 'node:crypto';
import { AdError, collectSlots, fetchJSON, findOne, requiredId } from './shared.mjs';

const service = 'Mintegral';
const adTypes = ['rewarded_video', 'new_interstitial', 'banner'];
const md5 = value => createHash('md5').update(value).digest('hex');

export async function createMintegral(input, env) {
    if (!env.MINTEGRAL_SKEY || !env.MINTEGRAL_SECRET) {
        throw new AdError('Cloudflare 尚未配置 Mintegral 的 Create APP&Unit API 凭据。', 503);
    }

    async function call(path, fields, create = false) {
        const time = String(Math.floor(Date.now() / 1000));
        const query = new URLSearchParams({
            ...fields, skey: env.MINTEGRAL_SKEY, time, sign: md5(env.MINTEGRAL_SECRET + md5(time)),
        });
        const url = 'https://dev.mintegral.com' + path;
        const result = await fetchJSON(service, create ? url : `${url}?${query}`,
            create ? { method: 'POST', body: query } : undefined);
        if (!result?.data || ![0, 200].includes(Number(result.code))) {
            const hint = result && Number.isInteger(Number(result.code)) ? `（平台错误码 ${result.code}）` : '';
            throw new AdError(`Mintegral 请求未完成${hint}，请核对 API 权限或后台记录。`);
        }
        return result.data;
    }

    async function list(path, filter) {
        const rows = [];
        for (let page = 1; page <= 20; page++) {
            const result = await call(path, { ...filter, page });
            if (page === 1 && result.lists == null && result.total === 0) return [];
            if (!Array.isArray(result.lists) || !Number.isInteger(result.total)) break;
            rows.push(...result.lists);
            if (rows.length >= result.total) return rows;
            if (!result.lists.length || (result.page !== undefined && result.page !== page)) break;
        }
        throw new AdError('Mintegral 未返回完整列表，已暂停创建。');
    }

    const os = input.platform.toUpperCase();
    const appPackage = input.platform === 'ios' ? `id${input.storeId}` : input.storeId;
    const apps = await list('/v2/app/open_api_list', { os, package: appPackage });
    const existingApp = findOne(apps, app => app.os === os && app.package === appPackage, ' Mintegral 应用');
    const app = existingApp || await call('/app/open_api_create', {
        app_name: input.app_name, os, package: appPackage, coppa: input.coppa,
        mediation_platform: 1,
        is_live_in_store: input.download_url ? 1 : 0,
        ...(input.download_url ? { store_url: input.download_url } : {}),
    }, true);
    const appId = requiredId(app.app_id, 'Mintegral App ID');
    const current = await list('/v2/placement/open_api_list', { app_id: appId });
    const bidding = input.mode === 'bidding' ? 1 : 0;

    const placements = await collectSlots(async (name, index) => {
        const adType = adTypes[index];
        const existingPlacement = findOne(current, placement => placement.placement_name === name &&
            placement.ad_type === adType && String(placement.app_id) === appId, ' Mintegral Placement');
        const unitName = bidding ? `${name}_Bidding` : name;
        if (!existingPlacement) {
            const created = await call('/v2/placement/open_api_create', {
                app_id: appId, placement_name: name, ad_type: adType, integrate_type: 'sdk',
                [bidding ? 'hb_unit_name' : 'unit_names']: unitName,
            }, true);
            const placementId = requiredId(created.placement_id, 'Mintegral Placement ID');
            if (created.unit_ids?.length !== 1) {
                throw new AdError('已返回 Placement，但未确认 Unit ID。再次提交可按名称查找 Unit。');
            }
            return { id: requiredId(created.unit_ids[0], 'Mintegral Unit ID'), placement_id: placementId, name, status: 'created' };
        }

        const placementId = requiredId(existingPlacement.placement_id, 'Mintegral Placement ID');
        const units = await list('/v2/unit/open_api_list', { placement_id: placementId });
        const existingUnit = findOne(units, unit => unit.unit_name === unitName &&
            String(unit.placement_id) === placementId && Number(unit.bidding_type) === bidding, ' Mintegral Unit');
        const unit = existingUnit || await call('/v2/unit/open_api_create', {
            app_id: appId, placement_id: placementId, unit_name: unitName, bidding_type: bidding,
        }, true);
        return { id: requiredId(unit.unit_id, 'Mintegral Unit ID'), placement_id: placementId, name, status: existingUnit ? 'existing' : 'created' };
    });
    return { app_id: appId, app_name: app.app_name || input.app_name, is_app_exists: Boolean(existingApp), placements };
}
