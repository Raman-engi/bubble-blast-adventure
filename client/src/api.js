import { GAME_CONFIG } from './config/gameConfig';

const API_URL = GAME_CONFIG.apiUrl;

/* Small fetch wrapper: JWT header, 8s timeout, JSON errors. */
export async function request(path, opts = {}) {
  const token = localStorage.getItem('token');

  // A sleeping/offline server must never freeze the game: give up after 8s.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      signal: controller.signal,
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers
      }
    });
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({
    message: 'Server returned an invalid response'
  }));

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}
