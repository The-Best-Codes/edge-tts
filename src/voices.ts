import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { VOICE_LIST, VOICE_HEADERS, SEC_MS_GEC_VERSION } from "./constants";
import { DRM } from "./drm";
import type {
  Voice,
  VoicesManagerFindOptions,
  VoicesManagerVoice,
} from "./types";

async function fetchVoicesInternal(proxy?: string): Promise<Voice[]> {
  const url = `${VOICE_LIST}&Sec-MS-GEC=${DRM.generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

  const headers = DRM.headersWithMuid(VOICE_HEADERS);
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

  const response = await axios.get(url, {
    headers,
    httpsAgent: agent,
    proxy: false,
    validateStatus: (status) => status < 500,
  });

  if (response.status === 403) {
    // Clock skew error handling logic
    DRM.handleClientResponseError(response.headers);
    // Retry
    const retryUrl = `${VOICE_LIST}&Sec-MS-GEC=${DRM.generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
    const retryResponse = await axios.get(retryUrl, {
      headers: DRM.headersWithMuid(VOICE_HEADERS),
      httpsAgent: agent,
      proxy: false,
    });
    return retryResponse.data;
  }

  if (response.status >= 400) {
    throw new Error(
      `Failed to list voices: ${response.status} ${response.statusText}`,
    );
  }

  return response.data;
}

export async function listVoices(proxy?: string): Promise<Voice[]> {
  const voices = await fetchVoicesInternal(proxy);

  // Normalize missing tags
  voices.forEach((v) => {
    if (!v.VoiceTag)
      v.VoiceTag = { ContentCategories: [], VoicePersonalities: [] };
    if (!v.VoiceTag.ContentCategories) v.VoiceTag.ContentCategories = [];
    if (!v.VoiceTag.VoicePersonalities) v.VoiceTag.VoicePersonalities = [];
  });

  return voices;
}

export class VoicesManager {
  voices: VoicesManagerVoice[] = [];
  private createCalled = false;

  static async create(customVoices?: Voice[]): Promise<VoicesManager> {
    const instance = new VoicesManager();
    const source = customVoices || (await listVoices());

    instance.voices = source.map((v) => ({
      ...v,
      Language: v.Locale.split("-")[0] ?? "",
    }));
    instance.createCalled = true;
    return instance;
  }

  find(options: VoicesManagerFindOptions): VoicesManagerVoice[] {
    if (!this.createCalled) {
      throw new Error(
        "VoicesManager.find() called before VoicesManager.create()",
      );
    }

    return this.voices.filter((voice) => {
      let match = true;
      if (options.Gender && voice.Gender !== options.Gender) match = false;
      if (options.Locale && voice.Locale !== options.Locale) match = false;
      if (options.Language && voice.Language !== options.Language)
        match = false;
      if (options.ShortName && voice.ShortName !== options.ShortName)
        match = false;
      return match;
    });
  }
}
