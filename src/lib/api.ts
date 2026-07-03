export async function apiFetch(url: string | URL, options: RequestInit = {}): Promise<Response> {
  const urlString = typeof url === 'string' ? url : (url instanceof URL ? url.toString() : '');

  // 1. Rely entirely on secure HttpOnly cookies by setting credentials to include
  if (urlString.startsWith('/api/')) {
    options.credentials = 'include';
  }

  // 2. Perform actual fetch request using window.fetch
  const response = await window.fetch(url, options);

  return response;
}
