import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface AuthCheckerProps {
  children: React.ReactNode;
}

export default function AuthChecker({ children }: AuthCheckerProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthStatus = async () => {
      const loggedInSignal = localStorage.getItem('isLoggedIn');
      if (!loggedInSignal) {
        setIsAuthenticated(false);
        setIsChecking(false);
        return;
      }

      try {
        const response = await fetch('/api/login/checkLogin');
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          localStorage.removeItem('isLoggedIn');
        }
      } catch (error) {
        console.error('Erro ao verificar sessão:', error);
        setIsAuthenticated(false);
        localStorage.removeItem('isLoggedIn');
      } finally {
        setIsChecking(false);
      }
    };

    checkAuthStatus();
  }, [location.key]);

  useEffect(() => {
    if (!isChecking) {
      // 1. Definimos as rotas que um usuário NÃO autenticado pode acessar
      const publicPaths = ['/login', '/register'];

      if (isAuthenticated && publicPaths.includes(location.pathname)) {
        // Se está autenticado e em uma página pública (login/register), vai para o chat
        navigate('/');
      } else if (!isAuthenticated && !publicPaths.includes(location.pathname)) {
        // 2. Modificamos a condição: se não está autenticado e a rota NÃO ESTÁ na lista de públicas, vai para o login
        navigate('/login');
      }
    }
  }, [isAuthenticated, isChecking, location.pathname, navigate]);

  if (isChecking) {
    return <div className="session-checker">Verificando sessão...</div>;
  }

  return <>{children}</>;
}
