export type TailscaleProvisionConfig = {
  oauthClientId: string;
  oauthClientSecret: string;
  agentTag: string;
  authKeyTtlSeconds: number;
  timeoutMs: number;
};

type OAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type AuthKeyResponse = {
  key?: string;
};

type CachedAccessToken = {
  value: string;
  expiresAt: number;
};

const OAUTH_TOKEN_URL = 'https://api.tailscale.com/api/v2/oauth/token';
const AUTH_KEY_URL = 'https://api.tailscale.com/api/v2/tailnet/-/keys';
const TAG_PATTERN = /^tag:[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidTailscaleTag(value: string) {
  return TAG_PATTERN.test(value);
}

export function createTunnelHostname(siteId: string) {
  if (!/^\d+$/.test(siteId)) throw new Error('invalid_site_id');
  return `fieldlink-${siteId}`;
}

export function createAuthKeyRequest(agentTag: string, ttlSeconds: number, siteId: string) {
  if (!isValidTailscaleTag(agentTag)) throw new Error('invalid_tailscale_tag');
  return {
    capabilities: {
      devices: {
        create: {
          reusable: false,
          ephemeral: false,
          preauthorized: true,
          tags: [agentTag],
        },
      },
    },
    expirySeconds: Math.min(Math.max(ttlSeconds, 60), 3600),
    description: `Fieldlink site ${siteId} agent bootstrap`,
  };
}

export class TailscaleProvisioner {
  private cachedAccessToken?: CachedAccessToken;

  constructor(
    private readonly provisionConfig: TailscaleProvisionConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get isConfigured() {
    return Boolean(
      this.provisionConfig.oauthClientId
      && this.provisionConfig.oauthClientSecret
      && isValidTailscaleTag(this.provisionConfig.agentTag),
    );
  }

  async createOneTimeAuthKey(siteId: string) {
    if (!this.isConfigured) throw new Error('tailscale_not_configured');
    const accessToken = await this.getAccessToken();
    const response = await this.fetchWithTimeout(AUTH_KEY_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(createAuthKeyRequest(
        this.provisionConfig.agentTag,
        this.provisionConfig.authKeyTtlSeconds,
        siteId,
      )),
    });
    if (!response.ok) throw new Error(`tailscale_auth_key_failed_${response.status}`);
    const body = await response.json() as AuthKeyResponse;
    if (!body.key?.startsWith('tskey-auth-')) throw new Error('tailscale_auth_key_missing');
    return {
      authKey: body.key,
      hostname: createTunnelHostname(siteId),
      tag: this.provisionConfig.agentTag,
    };
  }

  private async getAccessToken() {
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > Date.now() + 60_000) {
      return this.cachedAccessToken.value;
    }

    const form = new URLSearchParams({
      client_id: this.provisionConfig.oauthClientId,
      client_secret: this.provisionConfig.oauthClientSecret,
      grant_type: 'client_credentials',
      scope: 'auth_keys',
      tags: this.provisionConfig.agentTag,
    });
    const response = await this.fetchWithTimeout(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!response.ok) throw new Error(`tailscale_oauth_failed_${response.status}`);
    const body = await response.json() as OAuthTokenResponse;
    if (!body.access_token) throw new Error('tailscale_oauth_token_missing');

    const expiresInSeconds = Math.min(Math.max(body.expires_in || 3600, 60), 3600);
    this.cachedAccessToken = {
      value: body.access_token,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
    return body.access_token;
  }

  private async fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.provisionConfig.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('tailscale_api_timeout');
      }
      throw new Error('tailscale_api_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
