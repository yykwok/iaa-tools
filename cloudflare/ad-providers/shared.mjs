export class AdError extends Error {
    constructor(message, status = 502) {
        super(message);
        this.status = status;
    }
}

export const formats = [
    { key: 'reward', name: 'MAX_Rewarded' },
    { key: 'inter', name: 'MAX_Interstitial' },
    { key: 'banner', name: 'MAX_Banner' },
];

export function dataId(value) {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return '';
    if (typeof value !== 'number' && typeof value !== 'string') return '';
    const id = String(value).trim();
    return id === '0' ? '' : id;
}

export function requiredId(value, label) {
    const id = dataId(value);
    if (!id) throw new AdError(`平台未返回 ${label}。请在重试前核对后台记录。`);
    return id;
}

export function findOne(rows, predicate, label) {
    const matches = rows.filter(predicate);
    if (matches.length > 1) throw new AdError(`找到多个匹配的${label}，请先到平台后台核对。`, 409);
    return matches[0];
}

export async function fetchResponse(service, url, options) {
    let response;
    try {
        response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(12000) });
    } catch {
        throw new AdError(`${service} 请求失败或超时，请先核对后台记录。`);
    }

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            throw new AdError(`${service} 拒绝访问，请核对发布商凭据及建位权限。`);
        }
        throw new AdError(`${service} 请求失败（HTTP ${response.status}）。`);
    }
    return response;
}

export async function fetchJSON(service, url, options) {
    return (await fetchResponse(service, url, options)).json().catch(() => null);
}

export function bearerOptions(token, body) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body === undefined) return { headers };
    headers['Content-Type'] = 'application/json';
    return { method: 'POST', headers, body: JSON.stringify(body) };
}

export async function collectSlots(resolveSlot) {
    const rows = await Promise.all(formats.map(async (format, index) => {
        try {
            return [format.key, await resolveSlot(format.name, index)];
        } catch (error) {
            return [format.key, {
                name: format.name,
                status: 'failed',
                message: error instanceof AdError ? error.message : '未确认，请核对平台后台。',
            }];
        }
    }));
    return Object.fromEntries(rows);
}
