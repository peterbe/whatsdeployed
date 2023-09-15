import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';

import Routes from './Routes';
import './App.css';

export default class App extends React.Component {
  render() {
    return (
      <Router>
        <div className="App container">
          <Routes />
          <Footer />
        </div>
      </Router>
    );
  }
}

class Footer extends React.Component {
  render() {
    let versionData;
    if (document.querySelector('#_version')) {
      versionData = Object.assign(
        {},
        document.querySelector('#_version').dataset,
      );
    }

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
          </a>{' '}
          {versionData && (
            <>
              &bull;{' '}
              <a
                href={`https://github.com/peterbe/whatsdeployed/commit/${versionData.commit}`}
                title={`Date: ${versionData.date}`}
              >
                version <code>{versionData.commit.slice(0, 7)}</code>
              </a>
            </>
          )}
        </p>
      </footer>
    );
  }
}
