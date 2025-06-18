import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
      // 1. Verificação otimista no localStorage
      const loggedInSignal = localStorage.getItem("isLoggedIn");
      if (!loggedInSignal) {
        setIsAuthenticated(false);
        setIsChecking(false);
        return;
      }

      // 2. Verificação segura no backend
      try {
        const response = await fetch("/api/login/checkLogin");
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          localStorage.removeItem("isLoggedIn"); // Limpa o sinal inválido
        }
      } catch (error) {
        console.error("Erro ao verificar sessão:", error);
        setIsAuthenticated(false);
        localStorage.removeItem("isLoggedIn");
      } finally {
        setIsChecking(false);
      }
    };

    checkAuthStatus();
  }, [location.key]); // Roda a verificação toda vez que a rota muda

  useEffect(() => {
    if (!isChecking) {
      if (isAuthenticated && location.pathname === "/login") {
        // Se está autenticado e na página de login, vai para o chat
        navigate("/");
      } else if (!isAuthenticated && location.pathname !== "/login") {
        // Se não está autenticado e fora da página de login, vai para o login
        navigate("/login");
      }
    }
  }, [isAuthenticated, isChecking, location.pathname, navigate]);

  if (isChecking) {
    return <div>Verificando sessão...</div>; // Tela de loading
  }

  return <>{children}</>;
}
