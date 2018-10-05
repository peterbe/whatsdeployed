import React from 'react';
import PropTypes from 'prop-types';
import ky from 'ky';
import TimeAgo from 'react-timeago';
import classNames from 'classnames';

import AutoProgressBar from './AutoProgressBar';
import shortUrls from './shortUrls';

const BORS_LOGIN = 'bors[bot]';

export default class DeployPage extends React.Component {
  static propsTypes = {
    owner: PropTypes.string.isRequired,
    repo: PropTypes.string.isRequired,
    deployments: PropTypes.arrayOf(
      PropTypes.shape({
        url: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired
      })
    ).isRequired
  };

  constructor(props) {
    super(props);
    this.state = {
      commits: null,
      deployInfo: null,
      error: null,
      loading: null,
      tags: null
    };
  }

  isLoading() {
    if (this.state.loading === null) {
      return true;
    }
    return this.state.loading.size > 0;
  }

  startLoad(name) {
    this.setState(({ loading }) => {
      if (!loading) {
        loading = new Set();
      }
      loading.add(name);
      return { loading };
    });
  }

  finishLoad(name) {
    this.setState(state => state.loading.delete(name));
  }

  async fetchShas() {
    const { owner, repo, deployments } = this.props;
    this.startLoad('shas');
    try {
      const res = await ky
        .post('/shas', { json: { owner, repo, deployments } })
        .json();

      this.setState({
        deployInfo: res.deployments,
        tags: res.tags
      });
    } catch (error) {
      this.setState({ error });
    } finally {
      this.finishLoad('shas');
    }
  }

  async fetchCommits() {
    const { owner, repo } = this.props;
    this.startLoad('commits');
    try {
      const commitsUrl = new URL(window.location.origin);
      commitsUrl.pathname = '/githubapi/commits';
      commitsUrl.searchParams.set('owner', owner);
      commitsUrl.searchParams.set('repo', repo);
      commitsUrl.searchParams.set('per_page', 100);

      const commits = await ky.get(commitsUrl).json();

      this.setState({ commits });
    } catch (error) {
      this.setState({ error });
    } finally {
      this.finishLoad('commits');
    }
  }

  componentDidMount() {
    this.fetchShas();
    this.fetchCommits();
  }

  render() {
    const { owner, repo } = this.props;
    const { error, loading, deployInfo, commits, tags } = this.state;

    document.title = `What's deployed on ${owner}/${repo}? (React)`;

    if (error) {
      return <div className="alert alert-danger">{error.toString()}</div>;
    }

    if (this.isLoading()) {
      return (
        <div>
          <span>Loading {Array.from(loading || '...').join(' and ')}</span>
          <AutoProgressBar
            count={loading ? loading.size : 0}
            total={2}
            targetTime={3000}
          />
        </div>
      );
    }

    return (
      <div>
        <DeployTable deployInfo={deployInfo} commits={commits} tags={tags} />
        <RepoSummary
          deployInfo={deployInfo}
          tags={tags}
          owner={owner}
          repo={repo}
        />
        <Culprits deployInfo={deployInfo} owner={owner} repo={repo} />
      </div>
    );
  }
}

class DeployTable extends React.Component {
  static propTypes = {
    deployInfo: PropTypes.arrayOf(
      PropTypes.shape({ name: PropTypes.string.isRequired })
    ).isRequired,
    commits: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
    tags: PropTypes.object.isRequired
  };

  constructor(props) {
    super(props);
    this.state = {
      borsMode: false
    };
  }

  handleBorsCheckbox = ev => {
    this.setState({ borsMode: ev.target.checked });
  };

  render() {
    const { deployInfo, commits, tags } = this.props;
    const { borsMode } = this.state;

    let hasBors = false;

    const foundDeploy = {};
    for (const deploy of deployInfo) {
      foundDeploy[deploy.name] = false;
    }

    const usersByLogin = new Map();
    for (const commit of commits) {
      if (usersByLogin.has(commit.author.login)) {
        continue;
      }
      usersByLogin.set(commit.author.login, commit.author);
    }

    const commitRows = [];
    let foundMatch = false;
    for (const commit of commits) {
      for (const deploy of deployInfo) {
        if (commit.sha === deploy.sha) {
          foundDeploy[deploy.name] = true;
          if (Array.from(Object.values(foundDeploy)).every(f => f)) {
            foundMatch = true;
          }
        }
      }

      if (commit.author.login === BORS_LOGIN && commit.author.type === 'Bot') {
        hasBors = true;
      } else if (borsMode) {
        continue;
      }

      commitRows.push(
        <tr key={commit.sha}>
          <CommitDetails
            {...commit}
            tag={tags[commit.sha]}
            users={usersByLogin}
            borsMode={borsMode}
          />
          {deployInfo.map(deploy => (
            <td
              className={classNames({ checked: foundDeploy[deploy.name] })}
              key={`${commit.sha}:${deploy.name}`}
            />
          ))}
        </tr>
      );

      if (foundMatch) {
        break;
      }
    }

    return (
      <>
        <table className="deploy-table table table-hover table-bordered table-sm">
          <thead>
            <tr>
              <th>
                <span className="column-title">Commits on master</span>
                {hasBors && (
                  <span className="column-extra">
                    There are commits here by <code>{BORS_LOGIN}</code>.{' '}
                    <input
                      type="checkbox"
                      checked={borsMode}
                      onChange={this.handleBorsCheckbox}
                    />{' '}
                    Enable "bors mode"
                  </span>
                )}
              </th>
              {deployInfo.map(deployment => (
                <th key={`${deployment.name}-col`}>{deployment.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>{commitRows}</tbody>
        </table>

        <div className="deployed-metadata">
          {foundMatch ? (
            <div className="text-muted">
              Stopping as soon as all environments have a particular commit
              common
            </div>
          ) : (
            <div className="alert alert-warning" role="alert">
              Even after comparing the last {commits.length} commits, a common
              denominator could not be found! The difference is just too big.
              <br />
              Use the links below to compare directly on GitHub.
            </div>
          )}
          <BadgesAndUrls deployInfo={deployInfo} />
        </div>
      </>
    );
  }
}

class CommitDetails extends React.Component {
  static propTypes = {
    commit: PropTypes.shape({ message: PropTypes.string.isRequired })
      .isRequired,
    author: PropTypes.shape({
      login: PropTypes.string.isRequired,
      avatar_url: PropTypes.string.isRequired,
      html_url: PropTypes.string.isRequired
    }),
    html_url: PropTypes.string.isRequired,
    tag: PropTypes.any
  };

  parseBorsMessage(commit) {
    /* Extract out the lines that are generated by bors as the
    real commit message. Then return these with a '; ' delimiter. An example
    (full) bors commit message can look like this:
    --------------------------------------------------------------------------
    Merge #1520

    1520: Update python:3.6 Docker digest to 7eced2 r=mythmon a=renovate[bot]

    <p>This Pull Request updates Docker base image <code>python:3.6-slim</code> to the latest digest (<code>sha256:7eced2b....f967188845</code>). For details on Renovate's Docker support, please visit <a href="https://renovatebot.com/docs/docker">https://renovatebot.com/docs/docker</a></p>
    <hr />
    <p>This PR has been generated by <a href="https://renovatebot.com">Renovate Bot</a>.</p>

    Co-authored-by: Renovate Bot <bot@renovateapp.com>
    --------------------------------------------------------------------------
    */
    const { users } = this.props;
    let headers = commit.message
      .split(/\n\n/g)
      .filter(paragraph => /^\d+: /.test(paragraph));

    return {
      description: headers.join('; '),
      authors: headers
        .map(header => {
          const match = header.match(/a=([^ ]*)+/);
          if (match) {
            let [, author] = match;
            if (author === 'renovate[bot]') {
              author = 'renovate-bot';
            }
            if (users.has(author)) {
              return users.get(author);
            }
          }
          return null;
        })
        .filter(login => login)
    };
  }

  render() {
    let { commit, author, tag, html_url, borsMode } = this.props;

    let involvedUsers = [author];

    let title;
    if (borsMode && author.login === BORS_LOGIN && author.type === 'Bot') {
      const { description, authors } = this.parseBorsMessage(commit);
      title = description;
      for (const author of authors) {
        if (author && !involvedUsers.map(u => u.login).includes(author.login)) {
          involvedUsers.unshift(author);
        }
      }
    } else {
      title = commit.message.split(/\n\n+/)[0];
    }

    return (
      <td>
        <UserAvatar users={involvedUsers} />
        <a className="commit" href={html_url} title={commit.message}>
          {title}
        </a>
        {tag && (
          <span className="badge badge-pill badge-info" title={`Tag: ${tag}`}>
            {tag}
          </span>
        )}
        {commit.date}
        <TimeAgo
          date={commit.committer.date}
          className="badge badge-pill commit-date"
        />
      </td>
    );
  }
}

class UserAvatar extends React.Component {
  render() {
    const { users } = this.props;

    if (users.every(u => !u)) {
    }

    return (
      <div className="user-avatar-group">
        {users.map(user => {
          if (!user) {
            return (
              <span className="user-avatar unknown-user" title="Unknown User" />
            );
          } else {
            const { html_url, login, avatar_url } = user;
            return (
              <a
                key={login}
                className="user-avatar"
                href={html_url}
                title={login}
              >
                <img src={avatar_url} alt={login} />
              </a>
            );
          }
        })}
      </div>
    );
  }
}

class RepoSummary extends React.Component {
  render() {
    const { deployInfo, tags, owner, repo } = this.props;

    const repoUrl = `https://github.com/${owner}/${repo}`;

    return (
      <>
        <h2>Repository Info</h2>
        <a href={repoUrl}>{repoUrl}</a>
        <table className="table table-sm urls">
          <thead>
            <tr>
              <th>Revision URLs</th>
              <th>SHA</th>
              {deployInfo.map(deployment => (
                <td key={deployment.name}>{deployment.name}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {deployInfo.map(deployment => (
              <tr key={deployment.name}>
                <td>{deployment.name}</td>
                <td>
                  <ShaLink
                    sha={deployment.sha}
                    owner={owner}
                    repo={repo}
                    tags={tags}
                  />
                </td>
                {deployInfo.map(otherDeployment => {
                  if (otherDeployment.name === deployment.name) {
                    return <td key="same">-</td>;
                  } else {
                    return (
                      <td key={`${deployment.name}...${otherDeployment.name}`}>
                        <a
                          href={`${repoUrl}/compare/${deployment.sha}...${
                            otherDeployment.sha
                          }`}
                        >
                          Compare <b>{deployment.name}</b> ↔{' '}
                          <b>{otherDeployment.name}</b>
                        </a>
                      </td>
                    );
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }
}

class ShaLink extends React.Component {
  render() {
    const { sha, owner, repo, tags = {} } = this.props;
    const tag = tags[sha];
    return (
      <>
        <a href={`https://github.com/${owner}/${repo}/commit/${sha}`}>
          {sha.slice(0, 7)}
        </a>
        {tag && (
          <span className="badge badge-pill badge-info" title={`Tag: ${tag}`}>
            {tag}
          </span>
        )}
      </>
    );
  }
}

class Culprits extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      culprits: null,
      error: null
    };
  }

  componentDidMount() {
    this.fetchCulprits();
  }

  async fetchCulprits() {
    const { owner, repo, deployInfo } = this.props;
    this.setState({ loading: true });

    try {
      const { culprits } = await ky
        .post('/culprits', { json: { owner, repo, deployments: deployInfo } })
        .json();
      this.setState({ loading: false, culprits });
    } catch (error) {
      this.setState({ error });
    }
  }

  render() {
    const { loading, culprits, error } = this.state;

    return (
      <>
        <h2>Culprits</h2>
        {error && <div className="alert alert-danger">{error.toString()}</div>}
        {loading ? (
          '...'
        ) : (
          <div className="culprits">
            {culprits.map(group => (
              <div key={group.name} className="group">
                <h3>On {group.name}</h3>
                {group.users.map(([role, user]) => (
                  <div key={`${role}:${user}`} className="media">
                    <a href={user.html_url}>
                      <img
                        src={user.avatar_url}
                        alt={user.login}
                        width={44}
                        height={44}
                      />
                    </a>
                    <div className="media-body">
                      <b>
                        <a href={user.html_url}>{user.login}</a>
                      </b>
                      <p>{role}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }
}

class BadgesAndUrls extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, shortUrl: null, showHelp: false };
  }

  async componentDidMount() {
    try {
      const shortUrl = await shortUrls.fetchFor(window.location.href);
      this.setState({ shortUrl });
    } catch (error) {
      this.setState({ error });
    }
  }

  toggleHelp = () => {
    this.setState(state => ({ showHelp: !state.showHelp }));
  };

  render() {
    const { deployInfo } = this.props;
    const { error, shortUrl, showHelp } = this.state;

    if (error) {
      return (
        <div className="metadata-actions">
          <span title={error.toString()} style={{ fontWeight: 'bold' }}>
            ⚠
          </span>
        </div>
      );
    }

    if (!shortUrl) {
      return (
        <div className="metadata-actions">
          <span title="Loading...">...</span>
        </div>
      );
    }

    const { protocol, host } = window.location;
    const fullUrl = `${protocol}//${host}${shortUrl}`;
    const envs = deployInfo.map(deploy => deploy.name.toLowerCase()).join(',');
    const badgeUrl = `https://img.shields.io/badge/whatsdeployed-${envs}-green.svg`;
    const badgeAlt = `What's deployed on ${envs}?`;
    const markdown = `[![${badgeAlt}](${badgeUrl})](${fullUrl})`;
    const restructuredText = `.. |whatsdeployed| image:: ${badgeUrl}\n    :target: ${fullUrl}`;

    return (
      <>
        <div className="metadata-actions">
          <div>
            Short URL: <a href={shortUrl}>{fullUrl}</a>
          </div>

          <div>
            Badge:{' '}
            <a href={shortUrl}>
              <img alt={badgeAlt} title={badgeAlt} src={badgeUrl} />
            </a>
            <button
              className="btn btn-link"
              style={{ fontFamily: 'mono' }}
              onClick={this.toggleHelp}
            >
              {showHelp ? 'close' : 'help?'}
            </button>
          </div>
        </div>

        {showHelp && (
          <div>
            <h3>Badge Help</h3>
            <dl>
              <dt>Image URL</dt>
              <dd>
                <code>{badgeUrl}</code>
              </dd>
              <dt>Markdown</dt>
              <dd>
                <pre>
                  <code>{markdown}</code>
                </pre>
              </dd>
              <dt>ReStructuredText</dt>
              <dd>
                <pre>
                  <code>{restructuredText}</code>
                </pre>
              </dd>
            </dl>
          </div>
        )}
      </>
    );
  }
}
