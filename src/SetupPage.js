import React from 'react';
import { withRouter, Link } from 'react-router-dom';

import shortUrls from './shortUrls';

export default class SetupPage extends React.Component {
  render() {
    return (
      <div>
        <SetupFormWithRouter />
        <PreviousEnvironments />
        <WhatIsIt />
      </div>
    );
  }
}

class SetupForm extends React.Component {
  constructor(props) {
    super(props);
    this.onChange = this.onChange.bind(this);
    this.addRow = this.addRow.bind(this);
    this.submit = this.submit.bind(this);
  }

  state = {
    owner: '',
    repository: '',
    rows: [
      {
        name: '',
        url: ''
      }
    ]
  };

  onChange(ev) {
    const { name, value } = ev.target;
    this.setState({ [name]: value });
  }

  onRowChange(rowIdx, ev) {
    const name = ev.target.name;
    const value = ev.target.value;
    this.setState(state => {
      // replace an existing row without modifying any existing objects
      let newRows = [...state.rows];
      newRows[rowIdx][name] = value;
      return { rows: newRows };
    });
  }

  addRow() {
    this.setState(({ rows }) => ({
      rows: rows.concat([{ name: '', url: '' }])
    }));
  }

  submit(ev) {
    const { history } = this.props;
    const { owner, repository, rows } = this.state;
    let newUrl = shortUrls.buildLongUrl({
      owner,
      repo: repository,
      deployments: rows
    });
    ev.preventDefault();
    history.push({
      pathname: newUrl.pathname,
      search: newUrl.search,
      hash: '',
      state: null
    });
  }

  render() {
    const { owner, repository, rows } = this.state;
    document.title = "What's deployed?";

    return (
      <form>
        <div className="form-group">
          <label>Owner</label>
          <input
            type="text"
            name="owner"
            className="form-control"
            placeholder="e.g. mozilla"
            value={owner}
            onChange={this.onChange}
          />
        </div>
        <div className="form-group">
          <label>Repository</label>
          <input
            type="text"
            name="repository"
            className="form-control"
            placeholder="e.g. airmozilla"
            value={repository}
            onChange={this.onChange}
          />
        </div>
        <label>Revision URLs</label>
        {rows.map(({ name, url }, index) => (
          <div className="form-group revision" key={index}>
            <input
              type="text"
              name="name"
              className="form-control name"
              placeholder="e.g. Dev"
              value={name}
              onChange={this.onRowChange.bind(this, index)}
            />
            <input
              type="text"
              name="url"
              className="form-control url"
              placeholder="e.g. https://air-dev.allizom.org/media/revision or https://example.com/__version__"
              value={url}
              onChange={this.onRowChange.bind(this, index)}
            />
          </div>
        ))}
        <p>
          <button
            type="button"
            className="btn btn-secondary more"
            onClick={this.addRow}
          >
            Add Row
          </button>
        </p>
        <div>
          <button className="btn btn-primary" onClick={this.submit}>
            Generate <i>What's Deployed</i> Table
          </button>
        </div>
      </form>
    );
  }
}

const SetupFormWithRouter = withRouter(SetupForm);

class PreviousEnvironments extends React.Component {
  state = {
    environments: [],
    loading: false
  };

  componentWillUnmount() {
    this.dismounted = true;
  }

  async componentDidMount() {
    this.setState({ loading: true });
    const environments = await shortUrls.getAll();
    if (!this.dismounted) {
      this.setState({ environments, loading: false });
    }
  }

  render() {
    const { environments, loading } = this.state;
    if (loading) {
      return (
        <div id="previous">
          <h3>PreviousEnvironments</h3>
          <span>...</span>
        </div>
      );
    }

    return (
      <div id="previous">
        <h3>Previous Environments</h3>
        <ul>
          {environments.map(env => (
            <li key={env.revisions[0]}>
              <Link to={`/s/${env.shortlink}`}>
                {env.owner}/{env.repo}
              </Link>
              <span className="names">
                {env.revisions.map(r => r[0]).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
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
