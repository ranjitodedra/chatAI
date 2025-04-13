import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import CaptionPage from './components/CaptionPage';
import ThreeDPage from './components/ThreeDPage';

function App() {
  return (
    <BrowserRouter>
      {/* Header / Navigation bar visible on all pages */}
      <NavBar />
      {/* Define routes for each feature page */}
      <Routes>
        <Route path="/caption" element={<CaptionPage />} />
        <Route path="/3d" element={<ThreeDPage />} />
        {/* Redirect any unknown route or root to /caption as a default */}
        <Route path="*" element={<Navigate to="/caption" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
