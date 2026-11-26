export const providers = {
    pangle: {
        endpoint: 'https://api.hiyyk.com',
        appIdKey: 'pangle_app_id',
        appIdLabel: 'Pangle App ID',
        slotsKey: 'slots',
        legacyStatus: 'reuse',
    },
    vungle: {
        endpoint: 'https://vungle-auto-api.joeykwok012.workers.dev',
        appIdKey: 'vungle_app_id',
        appIdLabel: 'Vungle App ID',
        slotsKey: 'placements',
        legacyStatus: 'created-only',
    },
    unity: {
        endpoint: 'https://unity-api.hiyyk.com',
        appIdKey: 'unity_app_id',
        appIdLabel: 'Unity Application ID',
        slotsKey: 'placements',
        legacyStatus: 'name-fallback',
    },
};

const slotTypes = [
    ['reward', '激励视频'],
    ['inter', '插屏广告'],
    ['banner', 'Banner 广告'],
];

function identifier(value) {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
    if (typeof value !== 'string') return '';
    const id = value.trim();
    return /^[A-Za-z0-9_-][A-Za-z0-9_.:-]*$/.test(id) && id !== '0' ? id : '';
}

function readSlot(slot, provider) {
    const id = identifier(slot?.id);
    const name = typeof slot?.name === 'string' ? slot.name : '';
    const legacyFailure = typeof slot?.id === 'string' && /^创建失败[:：]/.test(slot.id);
    if (slot?.status === 'failed' || legacyFailure) {
        const reason = slot.message || (legacyFailure ? slot.id : '创建失败');
        return { name, status: typeof reason === 'string' ? reason : '创建失败' };
    }
    if (!id) return { name, status: '接口未返回有效 ID' };
    // Liftoff's internal placement ID uses 24 hexadecimal characters.
    if (provider === providers.vungle && /^[a-f0-9]{24}$/i.test(id)) {
        return { name, status: '接口未返回广告位 Reference ID' };
    }
    if (slot.status === 'existing') return { id, name, status: '已复用' };
    if (slot.status === 'created' || slot.is_new === true) return { id, name, status: '新建' };
    if (provider.legacyStatus === 'reuse' && slot.is_new === false) return { id, name, status: '已复用' };
    if (provider.legacyStatus === 'created-only' || (provider.legacyStatus === 'name-fallback' && id === name)) {
        return { name, status: '接口未确认广告位状态' };
    }
    return { id, name, status: '已返回 ID' };
}

export function readPlacements(data, provider) {
    // Older Unity responses use the application ID for both unity_app_id and unity_project_id.
    const legacyUnityId = provider === providers.unity ? identifier(data.unity_project_id) : '';
    const appId = identifier(data[provider.appIdKey]) || legacyUnityId;
    let appStatus = appId && typeof data.is_app_exists === 'boolean'
        ? (data.is_app_exists ? '已复用' : '新建')
        : '';
    if (appStatus === '已复用' && provider === providers.pangle) {
        appStatus = '已复用 · 请在 Pangle 核对应用平台';
    }
    return {
        appId,
        appName: typeof data.app_name === 'string' ? data.app_name : '',
        appStatus,
        slots: slotTypes.map(([key, label]) => ({ label, ...readSlot(data[provider.slotsKey]?.[key], provider) })),
    };
}

export async function requestPlacements(provider, input) {
    const signal = AbortSignal.timeout(45000);
    let response;
    try {
        response = await fetch(provider.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            signal,
        });
    } catch {
        if (signal.aborted) throw new Error('请求超时，平台可能仍在处理。请先核对平台记录。');
        throw new Error('无法连接建位接口。请检查网络，并在重试前核对平台记录。');
    }

    let payload;
    try {
        payload = await response.json();
    } catch {
        if (signal.aborted) throw new Error('请求超时，平台可能仍在处理。请先核对平台记录。');
        throw new Error(`接口返回了无法读取的结果（HTTP ${response.status}）。请先核对平台记录。`);
    }

    if (!response.ok || payload?.code !== 200) {
        const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
        if (message) throw new Error(message);
        if (Number.isInteger(payload?.code) && payload.code !== 200) {
            throw new Error(`建位接口返回错误（${payload.code}）。`);
        }
        if (!response.ok) throw new Error(`建位接口返回错误（HTTP ${response.status}）。`);
        throw new Error('接口未返回有效的建位状态。请先核对平台记录。');
    }
    if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
        throw new Error('接口未返回应用及广告位数据。请先核对平台记录。');
    }
    return payload.data;
}
