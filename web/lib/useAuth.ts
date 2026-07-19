import { useEffect, useState } from 'react';

interface AuthToken {
  token: string;
  refreshToken: string;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getToken = async () => {
      try {
        // Intentar obtener el token del localStorage
        const storedToken = localStorage.getItem('auth_token');
        if (storedToken) {
          setToken(storedToken);
        } else {
          // Si no hay token, obtener uno de desarrollo
          const response = await fetch('/auth/dev-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });

          if (response.ok) {
            const data = await response.json();
            const authToken = data.token || data.access_token;
            localStorage.setItem('auth_token', authToken);
            setToken(authToken);
          }
        }
      } catch (error) {
        console.error('Error getting auth token:', error);
      } finally {
        setLoading(false);
      }
    };

    getToken();
  }, []);

  const getAuthHeader = () => ({
    Authorization: token ? `Bearer ${token}` : '',
  });

  return { token, loading, getAuthHeader };
}
