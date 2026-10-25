import React from 'react';
import { Navigate } from 'react-router-dom';
import { getToken, getUser } from '../services/api';

const ProtectedRoute = ({ roles, children }) => {
  const user = getUser();

  if (!getToken() || !user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
