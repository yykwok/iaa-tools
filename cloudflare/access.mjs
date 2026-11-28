function fromBase64Url(value) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0));
}

export async function accessAllowed(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_ISSUER || !env.ACCESS_AUD) return false;
  try {
    const decoder = new TextDecoder();
    const [header, payload, signature, extra] = token.split(".");
    if (extra !== undefined) return false;
    const { alg, kid } = JSON.parse(decoder.decode(fromBase64Url(header)));
    const { aud, iss, exp, nbf, type } = JSON.parse(decoder.decode(fromBase64Url(payload)));
    const now = Math.floor(Date.now() / 1000);
    if (alg !== "RS256" || typeof kid !== "string" || iss !== env.ACCESS_ISSUER
        || !Array.isArray(aud) || !aud.includes(env.ACCESS_AUD) || type !== "app"
        || typeof exp !== "number" || exp <= now || (nbf !== undefined && (typeof nbf !== "number" || nbf > now))) return false;

    const response = await fetch(env.ACCESS_ISSUER + "/cdn-cgi/access/certs", {
      cf: { cacheEverything: true, cacheTtl: 300 }, signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return false;
    const { keys } = await response.json();
    const signingKey = keys.find(key => key.kid === kid && key.kty === "RSA");
    if (!signingKey) return false;
    const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const key = await crypto.subtle.importKey("jwk", signingKey, algorithm, false, ["verify"]);
    return await crypto.subtle.verify(algorithm, key, fromBase64Url(signature), new TextEncoder().encode(header + "." + payload));
  } catch {
    return false;
  }
}
