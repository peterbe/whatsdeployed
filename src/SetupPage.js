import React from 'react';
import shortUrls from './shortUrls';

export default class SetupPage extends React.Component {
  render() {
    return (
      <div>
        <SetupForm />
        <PreviousEnvironments />
        <WhatIsIt />
      </div>
    );
  }
}

class SetupForm extends React.Component {
  render() {
    document.title = `What's deployed?`;

    return (
      <form>
        <div className="form-group">
          <label>Owner</label>
          <input
            type="text"
            name="owner"
            className="form-control"
            id="owner"
            placeholder="e.g. mozilla"
          />
        </div>
        <div className="form-group">
          <label>Repository</label>
          <input
            type="text"
            name="repo"
            className="form-control"
            id="repo"
            placeholder="e.g. airmozilla"
          />
        </div>
        <div className="form-group revisions">
          <label>Revision URLs</label>
          <input
            type="text"
            name="name[]"
            className="form-control name"
            placeholder="e.g. Dev"
          />
          <input
            type="text"
            name="url[]"
            className="form-control url"
            placeholder="e.g. https://air-dev.allizom.org/media/revision or https://example.com/__version__"
          />
        </div>
        <p>
          <button type="button" className="btn btn-secondary more">
            Add Row
          </button>
        </p>
        <div>
          <button className="btn btn-primary">
            Generate <i>What's Deployed</i> Table
          </button>
        </div>

        <div id="previous" style={{ display: 'none' }}>
          <h3>Previous Environments</h3>
          <ul />
        </div>
      </form>
    );
  }
}

class PreviousEnvironments extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      environments: [],
      loading: false,
    }
  }

  async componentDidMount() {
    this.setState({ loading: true });
    const environments = await shortUrls.getAll();
    this.setState({ environments, loading: false });
  }

  render() {
    const { environments, loading } = this.state;
    if (loading) {
      return <div id="previous">
        <h3>PreviousEnvironments</h3>
        <span>...</span>
      </div>
    }

    return <div id="previous">
      <h3>PreviousEnvironments</h3>
      <ul>
        {environments.map(env => (
          <li key={env.revisions[0]}>
            <a href={env.url}>
              {env.owner}/{env.repo}
            </a>
            <span className="names">
              {env.revisions.map(r => r[0]).join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  }
}

class WhatIsIt extends React.Component {
  render() {
    return (
      <div id="whatisit">
        <h3>
          What Is <b>What's Deployed</b>?
          <small className="text-muted">Primer on what's in front of you</small>
        </h3>
        <p>
          <b>
            It's a web service for visualizing the difference between code
            committed to <code>master</code> in your GitHub project compared to
            which code has been deployed in your dev, stage and/or production
            environment(s).
          </b>
        </p>
        <h4>The Basics</h4>
        <p>
          For this to work you need to have your code in a{' '}
          <b>public GitHub repository</b> and the git SHA that is deployed on
          your server(s) need to be publicly available.
        </p>
        <p>
          The git SHA needs to be the content of the URL or it can be JSON that
          contains a top-level key called <code>commit</code>. For example:
        </p>
        <pre>
          $ curl https://dev.example.com/deployed-version.txt
          d16cc25d58252a2b7e6bb394cbefa76b147d64d3
        </pre>
        <p>Or, if it's JSON:</p>
        <pre>
          {`$ curl https://dev.example.com/deployed-version {"commit": "d16cc25d58252a2b7e6bb394cbefa76b147d64d3", "other": "stuff"}`}
        </pre>
        <p>
          Once you've typed in the GitHub organization, GitHub repository and at
          least one of these URLs you can generated a table that shows what's
          been deployed on the server(s) compared to what's available in the{' '}
          <code>master</code> branch.
        </p>
        <h4>Examples</h4>
        <ul>
          <li>
            <a
              href="https://whatsdeployed.io/s-5HY"
              target="_blank"
              rel="noopener noreferrer"
            >
              mozilla-services/tecken
            </a>
          </li>
          <li>
            <a
              href="https://whatsdeployed.io/s-Sir"
              target="_blank"
              rel="noopener noreferrer"
            >
              peterbe/django-peterbecom
            </a>
          </li>
          <li>
            <a
              href="https://whatsdeployed.io/s-pdF"
              target="_blank"
              rel="noopener noreferrer"
            >
              mozilla/treeherder
            </a>
          </li>
        </ul>
        <h4>Can I Have It?</h4>
        <p>
          This instance is public and free for anybody to use. The{' '}
          <a href="https://github.com/peterbe/whatsdeployed">source code</a> is
          open and available under the{' '}
          <a href="http://www.mozilla.org/MPL/2.0/">MPL 2.0</a> license.
        </p>
        <p>
          It's just a <a href="http://flask.pocoo.org/">Flask</a> app and you
          can install and run your own instance if you want to use this for your
          private repositories.
        </p>
      </div>
    );
  }
}
