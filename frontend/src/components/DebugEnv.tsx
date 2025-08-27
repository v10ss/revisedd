import React from 'react';

const DebugEnv: React.FC = () => {
  return (
    <div style={{ 
      position: 'fixed', 
      top: 10, 
      right: 10, 
      background: 'black', 
      color: 'white', 
      padding: '10px', 
      fontSize: '12px',
      zIndex: 9999,
      border: '2px solid red'
    }}>
      <div><strong>🐛 DEBUG ENV</strong></div>
      <div>NODE_ENV: {process.env.NODE_ENV}</div>
      <div>REACT_APP_API_URL: {process.env.REACT_APP_API_URL}</div>
      <div>BUILD_TIME: {process.env.REACT_APP_BUILD_TIME}</div>
      <div>Computed API: {process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}</div>
    </div>
  );
};

export default DebugEnv;
