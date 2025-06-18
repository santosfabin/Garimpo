import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import AuthChecker from './components/AuthChecker';

function App() {
  return (
    <BrowserRouter>
      <AuthChecker>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ChatPage />} />
        </Routes>
      </AuthChecker>
    </BrowserRouter>
  );
}

export default App;
