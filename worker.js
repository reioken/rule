/* Deductidle — Cloudflare Worker. API first, then static assets. */
import { handleApi } from './api.js';

export default {
  async fetch(request, env) {
    const api = await handleApi(request, env);
    if (api) return api;
    return env.ASSETS.fetch(request);
  },
};
