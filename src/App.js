import React from 'react';
import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

import SetupPage from './SetupPage.js';
import DeployPage from './DeployPage.js';
import './App.css';

export default class App extends React.Component {
  render() {
    let content = <SetupPage />;

    if (window.location.search) {
      let url = new URL(window.location);
      const names = url.searchParams.getAll('name[]');
      const urls = url.searchParams.getAll('url[]');
      const deployments = names.map((name, idx) => ({ name, url: urls[idx] }));

      content = (
        <DeployPage
          owner={url.searchParams.get('owner')}
          repo={url.searchParams.get('repo')}
          deployments={deployments}
        />
      );
    }

    return (
      <div className="App container">
        <Header />
        {content}
        <Footer />
      </div>
    );
  }
}

class Header extends React.Component {
  render() {
    return <h2 className="text-center">What's Deployed?</h2>;
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
