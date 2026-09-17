/* Deductidle — Cloudflare Worker. API first, then static assets. */
import { handleApi } from './api.js';

export default {
  async fetch(request, env) {
    const api = await handleApi(request);
    if (api) return api;
    return env.ASSETS.fetch(request);
  },
};
