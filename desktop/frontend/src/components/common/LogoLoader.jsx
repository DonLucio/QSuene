import React from 'react';

function LogoLoader({ text = "Cargando biblioteca...", size = 68 }) {
  return (
    <div className="logo-loader-container">
      <div className="logo-loader-aura"></div>
      <svg 
        className="logo-loader-svg"
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path className="logo-bar logo-bar-1" d="M 4.54,10 V 13" stroke="#fafafa" strokeWidth="1.8" strokeLinecap="round" />
        <path className="logo-bar logo-bar-2 orange-bar" d="M 7.54,7 V 16" stroke="#f06812" strokeWidth="1.8" strokeLinecap="round" />
        <path className="logo-bar logo-bar-3" d="M 10.54,4 V 19" stroke="#fafafa" strokeWidth="1.8" strokeLinecap="round" />
        <path className="logo-bar logo-bar-4" d="M 13.54,7 V 16" stroke="#fafafa" strokeWidth="1.8" strokeLinecap="round" />
        <path className="logo-bar logo-bar-5" d="M 16.54,10 V 13" stroke="#fafafa" strokeWidth="1.8" strokeLinecap="round" />
        <path className="logo-bar logo-bar-6" d="M 19.54,7 V 16" stroke="#fafafa" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {text && <span className="logo-loader-text">{text}</span>}
    </div>
  );
}

export default LogoLoader;
