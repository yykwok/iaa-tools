import { workerEndpoint } from './providers.js';

const pages = {
    admob: {
        title: 'AdMob 广告位建位',
        help: '使用 AdMob 发布商 API 创建应用和广告位，需开通 v1beta 写入权限。',
        doc: 'https://developers.google.com/admob/api/reference/rest/v1beta/accounts.apps/create',
    },
    mintegral: {
        title: 'Mintegral 广告位建位',
        help: '返回 App ID 及每个格式的 Placement ID 和 Unit ID。竞价需开通 Header Bidding 权限。',
        doc: 'https://cdn-adn-https.rayjump.com/cdn-adn/open_api/MintegralAPI.html',
    },
    ironsource: {
        title: 'ironSource Ads 广告位建位',
        help: '返回 MAX 所需的 App Key 和 Instance ID。竞价模式读取平台分配的实例，传统模式创建缺失实例。',
        doc: 'https://docs.unity.com/en-us/grow/is-ads/monetization/apis/ironsource-instances-api',
    },
    liftoff: {
        title: 'Liftoff Monetize 广告位建位',
        help: '返回 App ID 和 Placement Reference ID。创建已上架应用时请填写商店分类。',
        doc: 'https://support.vungle.com/hc/en-us/articles/360041251552-Publisher-Management-API-1-3',
    },
    pangle: {
        title: 'Pangle 广告位建位',
        help: '按系统和商店链接核对同名应用，创建缺失的代码位。',
        doc: 'https://www.pangleglobal.com/integration/management-api',
    },
    unity: {
        title: 'Unity Ads 广告位建位',
        help: '创建或复用应用和竞价广告位，返回 Game ID 和已核实的 Placement ID。',
        doc: 'https://docs.unity.com/en-us/oas-unified-platform-publisher-public/1.0.0',
    },
};

const name = new URLSearchParams(location.search).get('provider');
if (Object.hasOwn(pages, name)) {
    const page = pages[name];
    const form = document.getElementById('adForm');
    form.dataset.provider = name;
    form.dataset.worker = 'true';
    document.title = page.title;
    document.getElementById('setup-title').textContent = page.title;
    document.getElementById('setup-help').textContent = page.help;
    document.getElementById('access-link').href = workerEndpoint(name);
    document.getElementById('provider-doc').href = page.doc;
    document.getElementById('setup-links').hidden = false;

    for (const fieldset of form.querySelectorAll('fieldset[data-for]')) {
        const relevant = fieldset.dataset.for.split(' ').includes(name);
        fieldset.disabled = !relevant;
        fieldset.hidden = !relevant;
    }

    const storeUrl = form.elements.namedItem('download_url');
    function syncStoreFields() {
        const hasUrl = Boolean(storeUrl.value.trim());
        const linkStore = form.elements.namedItem('link_store');
        if (name === 'admob') linkStore.required = hasUrl;
        if (name === 'mintegral') form.elements.namedItem('store_id').required = !hasUrl;
    }

    storeUrl.addEventListener('input', syncStoreFields);
    syncStoreFields();
    if (name === 'pangle') {
        storeUrl.required = true;
        document.querySelector('label[for="downloadUrl"]').textContent = 'App Store 或 Google Play 链接';
    }
    await import('./form.js?v=glass2');
    form.hidden = false;
}
