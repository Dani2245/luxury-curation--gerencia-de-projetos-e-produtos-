import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken, getUser } from '../services/api';
import { loginUrl } from '../services/navigation';

const ProtectedRoute = ({ roles, children }) => {
  const user = getUser();
  const location = useLocation();

  if (!getToken() || !user) {
    return <Navigate to={loginUrl(location)} replace />;
  }

  if (roles && !roles.includes(user.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
