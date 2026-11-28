import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdMob } from './admob.mjs';
import { createIronSource } from './ironsource.mjs';
import { createLiftoff } from './liftoff.mjs';
import { createMintegral } from './mintegral.mjs';
import { createPangle } from './pangle.mjs';
import { createUnity } from './unity.mjs';
import { validateInput } from './input.mjs';

const input = { app_name: 'Example', platform: 'android', storeId: 'org.example.game' };
const storeUrl = 'https://play.google.com/store/apps/details?id=org.example.game';

function mockFetch(t, handler) {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (value, options) => {
        const url = new URL(value);
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        const method = options.method || 'GET';
        calls.push({ url, body, method });
        const result = await handler(url, body, method);
        return result instanceof Response ? result : Response.json(result);
    });
    return calls;
}

test('store identity must match the platform and AdMob requires consent to link', () => {
    assert.throws(() => validateInput({ ...input, download_url: storeUrl }, 'admob'), /确认/);
    assert.throws(() => validateInput({ ...input, platform: 'ios', download_url: storeUrl, link_store: 'yes' }, 'admob'), /一致/);
    assert.equal(validateInput({ ...input, download_url: storeUrl, link_store: 'yes' }, 'admob').storeId, input.storeId);
    assert.equal(validateInput({ ...input, coppa: '0', mode: 'bidding', store_id: 'id12345', platform: 'ios' }, 'mintegral').storeId, '12345');
});

test('AdMob lists all pages, then creates only missing formats on the matched app', async t => {
    const appId = 'ca-app-pub-1111222233334444~1234567890';
    const calls = mockFetch(t, (url, body, method) => {
        if (url.pathname === '/token') return { access_token: 'example-session' };
        if (url.pathname.endsWith('/apps')) {
            return url.searchParams.get('pageToken')
                ? { apps: [{ appId, platform: 'ANDROID', linkedAppInfo: { appStoreId: input.storeId } }] }
                : { nextPageToken: 'next' };
        }
        if (method === 'GET') return { adUnits: [{ appId, adFormat: 'BANNER', displayName: 'MAX_Banner', adUnitId: 'saved-banner' }] };
        assert.equal(body.appId, appId);
        return { adUnitId: 'created-' + body.adFormat };
    });
    const result = await createAdMob(input, {
        ADMOB_PUBLISHER_ID: 'pub-1111222233334444', ADMOB_CLIENT_ID: 'example-client',
        ADMOB_CLIENT_SECRET: 'example-secret', ADMOB_REFRESH_TOKEN: 'example-refresh',
    });
    assert.equal(result.app_id, appId);
    assert.equal(result.placements.banner.status, 'existing');
    assert.deepEqual(calls.filter(call => call.method === 'POST' && call.url.pathname.endsWith('/adUnits')).map(call => call.body.adFormat),
        ['REWARDED', 'INTERSTITIAL']);
});

test('Mintegral creates the missing unit on an existing placement and keeps partial results', async t => {
    const adTypes = ['rewarded_video', 'new_interstitial', 'banner'];
    const calls = mockFetch(t, (url, body, method) => {
        const fields = method === 'POST' ? body : url.searchParams;
        assert.match(fields.get('sign'), /^[a-f0-9]{32}$/);
        const list = lists => ({ code: 200, data: { total: lists.length, lists } });
        if (url.pathname.includes('/app/')) return list([{ app_id: 10, app_name: 'Example', os: 'ANDROID', package: input.storeId }]);
        if (url.pathname.includes('/placement/')) {
            return list(adTypes.map((ad_type, index) => ({ app_id: 10, placement_id: index + 20, ad_type,
                placement_name: ['MAX_Rewarded', 'MAX_Interstitial', 'MAX_Banner'][index] })));
        }
        if (method === 'POST') {
            if (fields.get('placement_id') === '22') return { code: 403, msg: 'Permission denied' };
            assert.equal(fields.get('bidding_type'), '1');
            return { code: 200, data: { unit_id: 101 } };
        }
        if (fields.get('placement_id') === '20') return list([{ placement_id: 20, unit_id: 100, bidding_type: 1, unit_name: 'MAX_Rewarded_Bidding' }]);
        return list([]);
    });
    const result = await createMintegral({ ...input, mode: 'bidding' }, { MINTEGRAL_SKEY: 'example', MINTEGRAL_SECRET: 'example' });
    assert.deepEqual(result.placements.reward, { id: '100', placement_id: '20', name: 'MAX_Rewarded', status: 'existing' });
    assert.equal(result.placements.inter.id, '101');
    assert.equal(result.placements.banner.status, 'failed');
    assert.equal(calls.filter(call => call.method === 'POST').length, 2);
});

test('ironSource bidding reads real instances and flags inactive ones without writes', async t => {
    const calls = mockFetch(t, (url) => {
        if (url.pathname.endsWith('/auth')) return 'test-token';
        if (url.pathname.endsWith('/applications/v6')) return [{ appKey: 'appkey', platform: 'Android', bundleId: input.storeId }];
        return [{ instanceName: 'Banner Bidder', isBidder: true, isLive: false, instanceId: 11, adUnit: 'banner' }];
    });
    const result = await createIronSource({ ...input, mode: 'bidding' }, { IRONSOURCE_SECRET_KEY: 'test', IRONSOURCE_REFRESH_TOKEN: 'test' });
    assert.equal(result.placements.banner.id, '11');
    assert.equal(result.placements.banner.status, 'inactive');
    assert.equal(result.placements.reward.status, 'failed');
    assert.ok(calls.every(call => call.method === 'GET'));
});

test('Pangle ignores an iOS namesake and queries slots only for the matching Android app', async t => {
    const calls = mockFetch(t, (url, body) => {
        if (url.pathname.endsWith('/site/query')) {
            assert.deepEqual(body.os_type, ['android']);
            assert.match(body.sign, /^[0-9a-f]{40}$/);
            return { code: 0, data: { app_list: [
                { app_id: 100, app_name: 'Example', os_type: 'ios', download_url: 'https://apps.apple.com/us/app/example/id1000' },
                { app_id: 200, app_name: 'Example', os_type: 'android', download_url: storeUrl + '&hl=en' },
            ] } };
        }
        assert.deepEqual(body.app_id, [200]);
        return { code: 0, data: { ad_slot_list: [
            { ad_slot_name: 'Example_reward', ad_slot_type: 5, ad_slot_id: 11 },
            { ad_slot_name: 'Example_inter', ad_slot_type: 6, ad_slot_id: 22 },
            { ad_slot_name: 'Example_banner', ad_slot_type: 2, ad_slot_id: 33 },
        ] } };
    });
    const result = await createPangle({ ...input, download_url: storeUrl }, { PANGLE_USER_ID: '99', PANGLE_ROLE_ID: '100', PANGLE_SECURITY_KEY: 'example' });
    assert.equal(result.pangle_app_id, '200');
    assert.equal(result.platform_verified, true);
    assert.ok(Object.values(result.slots).every(row => row.status === 'existing'));
    assert.equal(calls.length, 2);
});

test('Liftoff reuses a placement by name, format and auction type using its Reference ID', async t => {
    const calls = mockFetch(t, (url, body, method) => {
        if (url.hostname === 'auth-api.vungle.com') return { token: 'test-token' };
        if (url.pathname.endsWith('/applications')) return [{ id: 'liftoff-app', platform: 'android', store: { id: input.storeId } }];
        if (method === 'GET') return [
            { name: 'Example_reward', type: 'rewarded', referenceID: 'REWARDED-100', isHBParticipation: true },
            { name: 'MAX_Interstitial_Waterfall', type: 'interstitial', referenceID: 'WATERFALL-100', isHBParticipation: false },
        ];
        assert.equal(body.isHBParticipation, true);
        return { referenceID: 'CREATED-100' };
    });
    const result = await createLiftoff({ ...input, mode: 'bidding' }, { LIFTOFF_SECRET_TOKEN: 'test' });
    assert.equal(result.placements.reward.id, 'REWARDED-100');
    assert.equal(result.placements.inter.status, 'created');
    assert.equal(calls.filter(call => call.method === 'POST').length, 2);
});

test('Unity returns Game ID and confirms created placement keys as bidding', async t => {
    const bidders = [
        { name: 'Example_banner', adFormat: 'banner', placementType: 'bidding', placementId: 'banner-key', gameId: 345, platform: 'android' },
    ];
    mockFetch(t, (url, body, method) => {
        if (url.pathname.endsWith('/applications')) return [{ id: 'application', gameId: 345, name: 'Example', platform: 'Android' }];
        if (!url.pathname.includes('/applications/') && url.pathname.endsWith('/placements')) return bidders;
        if (method === 'GET') return [{ name: 'Example_banner', adFormat: 'banner', id: 'banner-resource', key: 'banner-key' }];
        assert.ok(['rewarded', 'interstitial'].includes(body.adFormat));
        const key = 'key-' + body.adFormat;
        if (body.adFormat === 'rewarded') {
            bidders.push({ adFormat: body.adFormat, placementType: 'bidding', placementId: key, gameId: 345, platform: 'android' });
        }
        return { id: 'another-resource', key };
    });
    const result = await createUnity({ ...input, storeId: '' }, {
        UNITY_ORG_ID: '12', UNITY_KEY_ID: 'test-key', UNITY_SECRET_KEY: 'test-secret',
    });
    assert.equal(result.unity_game_id, '345');
    assert.equal(result.placements.banner.id, 'banner-key');
    assert.equal(result.placements.reward.id, 'key-rewarded');
    assert.equal(result.placements.reward.status, 'created');
    assert.equal(result.placements.inter.id, undefined);
    assert.equal(result.placements.inter.status, 'failed');
});
