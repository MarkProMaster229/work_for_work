const BASE_URL = "/api";

async function handleResponse(response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export const api = {
  // ---------- Healthcheck ----------
  checkHealth: () => 
    fetch(`/api/health`).then(handleResponse),

  // ---------- Загрузка сценария ----------
  loadScenario: (data) => 
    fetch(`/api/scenario/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handleResponse),

  // ---------- Наземные пункты ----------
  getGroundSites: () => 
    fetch(`/api/ground_sites`).then(handleResponse),

  // ---------- Спутники ----------
  getSatellites: (t_s = 0) => 
    fetch(`/api/satellites?t_s=${t_s}`).then(handleResponse),

  getRoutes: (t_s = 0, overrides = null) => {
    if (overrides) {
      return fetch(`/api/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t_s, overrides }),
      }).then(handleResponse);
    }
    return fetch(`/api/routes?t_s=${t_s}`).then(handleResponse);
  },

  getSnapshot: (t_s = 0, overrides = null) => {
    if (overrides) {
      return fetch(`/api/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t_s, overrides }),
      }).then(handleResponse);
    }
    return fetch(`/api/snapshot?t_s=${t_s}`).then(handleResponse);
  },

  // ---------- Расчеты и экспорт результатов ----------
  calculate: (overrides = null) => 
    fetch(`/api/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides }),
    }).then(handleResponse),

  exportResult: (overrides = null) => 
    fetch(`/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides }),
    }).then(handleResponse),

  // ---------- Варианты ----------
  saveVariant: (name, overrides = {}, description = "") => 
    fetch(`/api/variants/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, overrides, description }),
    }).then(handleResponse),

  listVariants: () => 
    fetch(`/api/variants`).then(handleResponse),

  deleteVariant: (name) => 
    fetch(`/api/variants/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }).then(handleResponse),

  compareVariants: (variantA, variantB) => 
    fetch(`/api/variants/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant_a: variantA, variant_b: variantB }),
    }).then(handleResponse),

  // ---------- Экспорт сценария ----------
  exportScenario: (overrides = null) => 
    fetch(`/api/scenario/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides }),
    }).then(handleResponse),
};
export default api;