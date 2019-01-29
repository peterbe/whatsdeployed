import React from 'react';
import { BrowserRouter as Router, NavLink } from "react-router-dom";
import 'bootstrap/dist/css/bootstrap.min.css';

import Routes from './Routes';
import './App.css';

export default class App extends React.Component {
  render() {
    return (
      <Router>
        <div className="App container">
          <Header />
          <Routes />
          <Footer />
        </div>
      </Router>
    );
  }
}

class Header extends React.Component {
  render() {
    return (
      <h2 className="text-center">
        <NavLink to="/">What's Deployed?</NavLink>
      </h2>
    );
  }
}

class Footer extends React.Component {
  render() {
    return (
      <footer>
        <p>
          <a href="https://www.peterbe.com/plog/whatsdeployed.io">
            about this service
          </a>{' '}
          &bull; <a href="https://github.com/peterbe/whatsdeployed">the code</a>{' '}
          &bull;{' '}
          <a href="https://github.com/peterbe/whatsdeployed/issues/new">
            problems?
          </a>
        </p>
      </footer>
    );
  }
}
