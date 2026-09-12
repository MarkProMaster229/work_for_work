const BASE_URL = "/api";

async function handleResponse(response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

const jsonPost = (path, body) =>
  fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then(handleResponse);

export const api = {
  // 1. Healthcheck
  checkHealth: () =>
    fetch(`${BASE_URL}/health`).then(handleResponse),

  // 2. Загрузка сценария
  loadScenario: (data) =>
    jsonPost("/scenario/load", data),

  // 3. Экспорт сценария
  exportScenario: (overrides = null) =>
    jsonPost("/scenario/export", { overrides }),

  // 4. Наземные пункты
  getGroundSites: () =>
    fetch(`${BASE_URL}/ground_sites`).then(handleResponse),

  // 5. Спутники
  getSatellites: (t_s = 0) =>
    fetch(`${BASE_URL}/satellites?t_s=${t_s}`).then(handleResponse),

  // 6. Маршруты (GET)
  getRoutes: (t_s = 0) =>
    fetch(`${BASE_URL}/routes?t_s=${t_s}`).then(handleResponse),

  // 7. Маршруты с overrides (POST)
  getRoutesWithOverrides: (t_s = 0, overrides = {}) =>
    jsonPost("/routes", { t_s, overrides }),

  // 8. Снапшот (GET)
  getSnapshot: (t_s = 0) =>
    fetch(`${BASE_URL}/snapshot?t_s=${t_s}`).then(handleResponse),

  // 9. Снапшот с overrides (POST)
  getSnapshotWithOverrides: (t_s = 0, overrides = {}) =>
    jsonPost("/snapshot", { t_s, overrides }),

  // 10. Расчёт метрик
  calculate: (overrides = null) =>
    jsonPost("/calculate", { overrides }),

  // 11. Экспорт результата
  exportResult: (overrides = null) =>
    jsonPost("/export", { overrides }),

  // 12. Сохранить вариант
  saveVariant: (name, overrides = {}, description = "") =>
    jsonPost("/variants/save", { name, overrides, description }),

  // 13. Список вариантов
  listVariants: () =>
    fetch(`${BASE_URL}/variants`).then(handleResponse),

  // 14. Удалить вариант
  deleteVariant: (name) =>
    fetch(`${BASE_URL}/variants/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }).then(handleResponse),

  // 15. Сравнить варианты
  compareVariants: (variantA, variantB) =>
    jsonPost("/variants/compare", { variant_a: variantA, variant_b: variantB }),
};

export default api;