const BASE_URL = "/api";

async function handleResponse(response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export const api = {
  checkHealth: () =>
    fetch(`${BASE_URL}/health`).then(handleResponse),

  loadScenario: (data) =>
    fetch(`${BASE_URL}/scenario/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handleResponse),

  getGroundSites: () =>
    fetch(`${BASE_URL}/ground_sites`).then(handleResponse),

  getSatellites: (t_s = 0) =>
    fetch(`${BASE_URL}/satellites?t_s=${t_s}`).then(handleResponse),

  getRoutes: (t_s = 0, overrides = null) => {
    if (overrides) {
      return fetch(`${BASE_URL}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t_s, overrides }),
      }).then(handleResponse);
    }
    return fetch(`${BASE_URL}/routes?t_s=${t_s}`).then(handleResponse);
  },

  getSnapshot: (t_s = 0, overrides = null) => {
    if (overrides) {
      return fetch(`${BASE_URL}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t_s, overrides }),
      }).then(handleResponse);
    }
    return fetch(`${BASE_URL}/snapshot?t_s=${t_s}`).then(handleResponse);
  },

  calculate: (overrides = null) =>
    fetch(`${BASE_URL}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides }),
    }).then(handleResponse),

  exportResult: (overrides = null) =>
    fetch(`${BASE_URL}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides }),
    }).then(handleResponse),

  saveVariant: (name, overrides = {}, description = "") =>
    fetch(`${BASE_URL}/variants/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, overrides, description }),
    }).then(handleResponse),

  listVariants: () =>
    fetch(`${BASE_URL}/variants`).then(handleResponse),

  deleteVariant: (name) =>
    fetch(`${BASE_URL}/variants/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }).then(handleResponse),

  compareVariants: (variantA, variantB) =>
    fetch(`${BASE_URL}/variants/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant_a: variantA, variant_b: variantB }),
    }).then(handleResponse),

  exportScenario: (overrides = null) =>
    fetch(`${BASE_URL}/scenario/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides }),
    }).then(handleResponse),
};
export default api;