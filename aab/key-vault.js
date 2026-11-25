const storageKey = "yyk.aab.deepseek.v1";
const encoder = new TextEncoder();

function readVault() {
  const record = localStorage.getItem(storageKey);
  return record ? JSON.parse(record) : null;
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

export function setupKeyVault() {
  const form = document.getElementById("vault-form");
  const settings = form.closest("details");
  const password = document.getElementById("ds-password");
  const status = document.getElementById("vault-status");
  try { settings.open = !readVault(); }
  catch { status.textContent = "浏览器无法读取本机密钥配置。"; }

  form.onsubmit = async event => {
    event.preventDefault();
    const secret = form.elements.secret.value.trim();
    const passphrase = form.elements.passphrase.value;
    if (!/^sk-[A-Za-z0-9_-]+$/.test(secret) || passphrase.length < 10) {
      status.textContent = "请输入完整 API Key，并设置至少 10 位的密码。";
      return;
    }
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(passphrase, salt);
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(secret));
      localStorage.setItem(storageKey, JSON.stringify({ salt: [...salt], iv: [...iv], ciphertext: [...new Uint8Array(encrypted)] }));
      form.reset();
      password.value = "";
      settings.open = false;
      status.textContent = "密钥已加密保存。输入密码即可调用。";
    } catch {
      status.textContent = "无法在此浏览器加密保存密钥。";
    } finally {
      button.disabled = false;
    }
  };

  return async function unlock() {
    const record = readVault();
    if (!record) throw Error("请先在「配置本机 API Key」里保存密钥并设置密码。");
    if (!password.value) throw Error("请输入调用密码。");
    try {
      const key = await deriveKey(password.value, new Uint8Array(record.salt));
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(record.iv) }, key, new Uint8Array(record.ciphertext)
      );
      password.value = "";
      return new TextDecoder().decode(decrypted);
    } catch {
      throw Error("密码不正确，或本机密钥配置已损坏。");
    }
  };
}
