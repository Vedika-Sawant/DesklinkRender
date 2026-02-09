import React from 'react';
import { createHashRouter, createRoutesFromElements, Route } from 'react-router-dom';
import App from './App.jsx';

// Central router with React Router v6 data APIs and v7 future flags enabled.
// We keep App's internal <Routes> structure unchanged and mount it at the
// root splat path so navigation behavior remains identical.
export const router = createHashRouter(
  createRoutesFromElements(<Route path="/*" element={<App />} />),
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  },
);
