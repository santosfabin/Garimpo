import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./RegisterPage.css"; // Usaremos um CSS dedicado

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Validação básica no front-end para feedback rápido
    if (password.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/users", {
        // A rota de cadastro é POST /api/users
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // O backend retorna um objeto { error: 'mensagem' }
        throw new Error(data.error || "Erro ao criar a conta.");
      }

      // Se o cadastro for bem-sucedido, o backend já loga o usuário e envia o cookie.
      // Então, podemos sinalizar o login no localStorage e redirecionar.
      localStorage.setItem("isLoggedIn", "true");
      navigate("/"); // Redireciona para o chat
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-card">
        <div className="register-header">
          <h1 className="register-title">Criar Conta 🚀</h1>
          <p className="register-subtitle">
            Junte-se ao Garimpo e descubra filmes incríveis.
          </p>
        </div>
        <form className="register-form" onSubmit={handleRegister}>
          {error && <p className="error-message">{error}</p>}
          <div className="input-group">
            <input
              type="text"
              className="register-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome de usuário"
              required
              disabled={isLoading}
            />
          </div>
          <div className="input-group">
            <input
              type="email"
              className="register-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              disabled={isLoading}
            />
          </div>
          <div className="input-group">
            <input
              type="password"
              className="register-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha (mín. 8 caracteres)"
              required
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            className="register-button"
            disabled={isLoading}
          >
            {isLoading ? "Criando..." : "Cadastrar"}
          </button>
        </form>
        <div className="switch-page-link">
          Já tem uma conta? <Link to="/login">Faça login</Link>
        </div>
      </div>
    </div>
  );
}
