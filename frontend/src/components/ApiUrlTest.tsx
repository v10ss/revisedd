import React from 'react';

const ApiUrlTest: React.FC = () => {
  const envApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  const actualApiUrl = process.env.NODE_ENV === 'production' 
    ? 'https://escashop-backend.onrender.com/api'
    : envApiUrl;
  
  React.useEffect(() => {
    console.log('🔍 API URL TEST COMPONENT:');
    console.log('  NODE_ENV =', process.env.NODE_ENV);
    console.log('  REACT_APP_API_URL =', process.env.REACT_APP_API_URL);
    console.log('  Computed envApiUrl =', envApiUrl);
    console.log('  ACTUAL API URL USED =', actualApiUrl);
    console.log('  All process.env =', process.env);
  }, [envApiUrl, actualApiUrl]);

  return (
    <div style={{ 
      position: 'fixed', 
      top: '10px', 
      right: '10px', 
      background: 'rgba(0,0,0,0.8)', 
      color: 'white', 
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      zIndex: 9999
    }}>
      <div><strong>API URL Debug:</strong></div>
      <div>NODE_ENV: {process.env.NODE_ENV || 'undefined'}</div>
      <div>Env: {process.env.REACT_APP_API_URL || 'undefined'}</div>
      <div>Actual: {actualApiUrl}</div>
      <div>Build: {process.env.REACT_APP_BUILD_TIME || 'unknown'}</div>
    </div>
  );
};

export default ApiUrlTest;
