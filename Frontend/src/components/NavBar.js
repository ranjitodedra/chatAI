import React from 'react';
import { NavLink } from 'react-router-dom';
import './NavBar.css'; 

function NavBar() {
  return (
    <nav className="navbar">
      <h1 className="logo">LRDC</h1>
      <ul className="nav-links">
        <li>
          <NavLink to="/caption" className={({ isActive }) => isActive ? 'active' : ''}>
            Image Captioning
          </NavLink>
        </li>
        <li>
          <NavLink to="/3d" className={({ isActive }) => isActive ? 'active' : ''}>
            3D Object Generation
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default NavBar;