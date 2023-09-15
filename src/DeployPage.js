import React from 'react';
import PropTypes from 'prop-types';
import ky from 'ky/umd';
import TimeAgo from 'react-timeago';
import classNames from 'classnames';
import { Link } from 'react-router-dom';
import { CopyToClipboard } from 'react-copy-to-clipboard';

import AutoProgressBar from './AutoProgressBar';
import shortUrls from './shortUrls';
import { withRouter } from './Routes';
import { EllipsisLoading } from './Common';

const BORS_LOGIN = 'bors[bot]';

function makeTagAbsoluteUrl(owner, repo, tag) {
  return `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(
    tag,
  )}`;
}

class DeployPage extends React.Component {
  static propsTypes = {
    shortCode: PropTypes.string.isRequired,
  };

  state = {
    owner: null,
    repo: null,
    deployments: null,
    commits: null,
    deployInfo: null,
    error: null,
    loading: null,
    tags: null,
  };

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
    this.setState((state) => state.loading.delete(name));
  }

  async decodeShortCode() {
    const {
      history,
      match: { params },
    } = this.props;
    this.startLoad('parameters');
    try {
      let { owner, repo, deployments } = await shortUrls.decode(params.code);
      this.setState({ owner, repo, deployments });
      if (params.owner !== owner || params.repo !== repo) {
        history.replace(`/s/${params.code}/${owner}/${repo}`);
      }

      this.fetchShas();
      this.fetchCommits();
      this.finishLoad('parameters');
    } catch (error) {
      this.setState({ error });
    }
  }

  async fetchShas() {
    const { owner, repo, deployments } = this.state;
    this.startLoad('shas');
    try {
      const res = await ky
        .post('/shas', { json: { owner, repo, deployments } })
        .json();

      if (res.error) {
        this.setState({ error: res.error });
      } else {
        this.setState({
          deployInfo: res.deployments,
          tags: res.tags,
        });
      }
    } catch (error) {
      console.warn('Error fetching shas!');
      console.error(error);
      this.setState({ error });
    } finally {
      this.finishLoad('shas');
    }
  }

  async fetchCommits() {
    const { owner, repo } = this.state;
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

  update(props = this.props) {
    this.decodeShortCode();
  }

  componentDidMount() {
    this.update();
  }

  componentWillReceiveProps(newProps) {
    this.update();
  }

  render() {
    const {
      match: {
        params: { code },
      },
    } = this.props;
    const { error, loading, deployInfo, commits, tags, owner, repo } =
      this.state;

    document.title = `What's Deployed on ${owner}/${repo}?`;

    return (
      <div>
        <h2 className="text-center">
          <Link to="/">What's Deployed</Link>{' '}
          {owner && repo && (
            <span>
              {' '}
              on{' '}
              <a
                href={`https://github.com/${owner}/${repo}`}
                className="reponame"
              >
                {owner}/{repo}
              </a>
            </span>
          )}
          ?
        </h2>
        {error && <div className="alert alert-danger">{error.toString()}</div>}
        {this.isLoading() ? (
          <>
            <span>Loading {Array.from(loading || '...').join(' and ')}</span>
            <AutoProgressBar
              count={loading ? loading.size : 0}
              total={3}
              targetTime={5000}
            />
          </>
        ) : !deployInfo ? (
          <div className="alert alert-danger">
            No Deployment info could be found
          </div>
        ) : (
          <>
            <DeployTable
              deployInfo={deployInfo}
              commits={commits}
              tags={tags}
              code={code}
              owner={owner}
              repo={repo}
            />
            <RepoSummary
              deployInfo={deployInfo}
              tags={tags}
              owner={owner}
              repo={repo}
            />
            <Culprits deployInfo={deployInfo} owner={owner} repo={repo} />
          </>
        )}
      </div>
    );
  }
}

export default withRouter(DeployPage);

class DeployTable extends React.Component {
  static propTypes = {
    deployInfo: PropTypes.arrayOf(
      PropTypes.shape({ name: PropTypes.string.isRequired }),
    ).isRequired,
    commits: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
    tags: PropTypes.object.isRequired,
    code: PropTypes.string.isRequired,
    owner: PropTypes.string.isRequired,
    repo: PropTypes.string.isRequired,
  };
  static prefBorsModeCacheKey = 'pref-bors-mode';

  state = {
    borsMode: false,
  };

  componentDidMount() {
    this._restoreBorsModeChoice();
  }

  handleBorsCheckbox = (ev) => {
    this.setState({ borsMode: ev.target.checked }, this._persistBorsModeChoice);
  };

  _restoreBorsModeChoice = () => {
    const prefs = JSON.parse(
      localStorage.getItem(this.prefBorsModeCacheKey) || '{}',
    );
    if (
      this.props.code in prefs &&
      prefs[this.props.code] !== this.state.borsMode
    ) {
      this.setState({ borsMode: prefs[this.props.code] });
    }
  };

  _persistBorsModeChoice = () => {
    const prefs = JSON.parse(
      localStorage.getItem(this.prefBorsModeCacheKey) || '{}',
    );
    prefs[this.props.code] = this.state.borsMode;
    localStorage.setItem(this.prefBorsModeCacheKey, JSON.stringify(prefs));
  };

  render() {
    const { deployInfo, commits, tags, owner, repo, code } = this.props;
    const shortUrl = `/s/${code}`;

    const { borsMode } = this.state;

    let hasBors = false;

    const foundDeploy = {};
    for (const deploy of deployInfo) {
      foundDeploy[deploy.name] = false;
    }

    const usersByLogin = new Map();
    for (const commit of commits) {
      if (!commit.author || usersByLogin.has(commit.author.login)) {
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
          if (Array.from(Object.values(foundDeploy)).every((f) => f)) {
            foundMatch = true;
          }
        }
      }

      if (
        commit.author &&
        commit.author.login === BORS_LOGIN &&
        commit.author.type === 'Bot'
      ) {
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
            owner={owner}
            repo={repo}
          />
          {deployInfo.map((deploy) => (
            <td
              className={classNames({ checked: foundDeploy[deploy.name] })}
              key={`${commit.sha}:${deploy.name}`}
            />
          ))}
        </tr>,
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
              {deployInfo.map((deployment) => (
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
          <BadgesAndUrls
            deployInfo={deployInfo}
            shortUrl={shortUrl}
            owner={owner}
            repo={repo}
          />
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
      html_url: PropTypes.string.isRequired,
    }),
    html_url: PropTypes.string.isRequired,
    owner: PropTypes.string.isRequired,
    repo: PropTypes.string.isRequired,
    tag: PropTypes.any,
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
      .filter((paragraph) => /^\d+: /.test(paragraph));

    return {
      description: headers.join('; '),
      authors: headers
        .map((header) => {
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
        .filter((login) => login),
    };
  }

  render() {
    let { commit, author, tag, html_url, borsMode, owner, repo } = this.props;

    let involvedUsers = [];
    if (author) {
      involvedUsers.push(author);
    }

    let title;
    if (borsMode && author.login === BORS_LOGIN && author.type === 'Bot') {
      const { description, authors } = this.parseBorsMessage(commit);
      title = description;
      for (const author of authors) {
        if (
          author &&
          !involvedUsers.map((u) => u.login).includes(author.login)
        ) {
          involvedUsers.unshift(author);
        }
      }
    } else {
      title = commit.message.split(/\n\n+/)[0];
    }

    return (
      <td>
        <UserAvatars users={involvedUsers} />
        <a className="commit" href={html_url} title={commit.message}>
          {title}
        </a>
        {tag && (
          <a
            href={makeTagAbsoluteUrl(owner, repo, tag)}
            className="badge badge-pill badge-info"
            title={`Tag: ${tag}`}
          >
            {tag}
          </a>
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

function UserAvatars({ users }) {
  return (
    <div className="user-avatar-group">
      {users.map((user) => {
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

class RepoSummary extends React.Component {
  static propTypes = {
    deployInfo: PropTypes.arrayOf(
      PropTypes.shape({ name: PropTypes.string.isRequired }),
    ).isRequired,
    owner: PropTypes.string.isRequired,
    repo: PropTypes.string.isRequired,
    tags: PropTypes.object.isRequired,
  };

  render() {
    const { deployInfo, tags, owner, repo } = this.props;

    const repoUrl = `https://github.com/${owner}/${repo}`;

    return (
      <>
        <h4>Repository Info</h4>
        <p className="repo">
          <a href={repoUrl}>{repoUrl}</a>
        </p>
        <table className="table table-sm urls">
          <thead>
            <tr>
              <th>Revision URLs</th>
              <th>SHA</th>
              {deployInfo.map((deployment) => (
                <td key={deployment.name}>{deployment.name}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {deployInfo.map((deployment) => (
              <tr key={deployment.name}>
                <td>
                  <a
                    href={deployment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {deployment.name}
                  </a>
                </td>
                <td>
                  <ShaLink
                    sha={deployment.sha}
                    owner={owner}
                    repo={repo}
                    tags={tags}
                  />
                </td>
                {deployInfo.map((otherDeployment) => {
                  if (otherDeployment.name === deployment.name) {
                    return <td key="same">-</td>;
                  } else {
                    return (
                      <td key={`${deployment.name}...${otherDeployment.name}`}>
                        <a
                          href={`${repoUrl}/compare/${deployment.sha}...${otherDeployment.sha}`}
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
          <a
            href={makeTagAbsoluteUrl(owner, repo, tag)}
            className="badge badge-pill badge-info"
            title={`Tag: ${tag}`}
          >
            {tag}
          </a>
        )}
      </>
    );
  }
}

class Culprits extends React.PureComponent {
  state = {
    loading: true,
    culprits: null,
    error: null,
  };

  componentDidMount() {
    this.controller = new AbortController();
    this.fetchCulprits();
  }

  componentWillUnmount() {
    this.controller.abort();
    this.dismounted = true;
  }

  async fetchCulprits() {
    const { owner, repo, deployInfo } = this.props;
    this.setState({ loading: true });

    const { signal } = this.controller;
    try {
      const res = await ky
        .post('/culprits', {
          signal,
          json: { owner, repo, deployments: deployInfo },
        })
        .json();
      if (this.dismounted) return;
      if (res.error) {
        this.setState({ error: res.error });
      } else {
        this.setState({ culprits: res.culprits });
      }
    } catch (error) {
      if (this.dismounted) return;
      this.setState({ error });
    } finally {
      if (this.dismounted) return;
      this.setState({ loading: false });
    }
  }

  render() {
    const { loading, culprits, error } = this.state;
    return (
      <>
        <h3 className="page-header culprits">Culprits</h3>
        {error && <div className="alert alert-danger">{error.toString()}</div>}
        {loading && <EllipsisLoading text="loading culprits" />}
        {culprits && (
          <div className="culprits">
            {culprits.map((group) => (
              <div key={group.name} className="group">
                <h4>
                  <span className="on-prefix">On</span> {group.name}
                </h4>
                {group.users.map(([role, user]) => (
                  <div key={`${role}:${user.login}`} className="media">
                    <a href={user.html_url}>
                      <img
                        src={user.avatar_url}
                        alt={user.login}
                        width={44}
                        height={44}
                        className="mr-3 avatar"
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
  state = {
    showHelp: false,
    textCopied: '',
  };

  componentWillUnmount() {
    this.dismounted = true;
  }

  toggleHelp = () => {
    this.setState((state) => ({ showHelp: !state.showHelp }));
  };

  copiedText = (textCopied) => {
    this.setState({ textCopied }, () => {
      window.setTimeout(() => {
        if (!this.dismounted) {
          this.setState({ textCopied: '' });
        }
      }, 4 * 1000);
    });
  };

  showCopyToClipboard = (text) => {
    return (
      <CopyToClipboard text={text} onCopy={() => this.copiedText(text)}>
        <small>
          <button
            className="btn btn-outline-secondary btn-sm"
            disabled={text === this.state.textCopied}
          >
            {text === this.state.textCopied
              ? 'Copied to clipboard'
              : 'Copy to clipboard'}
          </button>
        </small>
      </CopyToClipboard>
    );
  };

  render() {
    const { deployInfo, shortUrl, owner, repo } = this.props;
    const { showHelp } = this.state;

    const { protocol, host } = window.location;
    const fullUrl = `${protocol}//${host}${shortUrl}/${owner}/${repo}`;
    const envs = deployInfo
      .map((deploy) => deploy.name.toLowerCase())
      .join(',');
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
            <button className="btn btn-link" onClick={this.toggleHelp}>
              {showHelp ? 'close' : 'help?'}
            </button>
          </div>
        </div>

        {showHelp && (
          <div>
            <h3>Badge Help</h3>
            <dl>
              <dt>Image URL {this.showCopyToClipboard(badgeUrl)}</dt>
              <dd>
                <pre>{badgeUrl}</pre>
              </dd>
              <dt>Markdown {this.showCopyToClipboard(markdown)}</dt>
              <dd>
                <pre>{markdown}</pre>
              </dd>
              <dt>
                ReStructuredText {this.showCopyToClipboard(restructuredText)}
              </dt>
              <dd>
                <pre>{restructuredText}</pre>
              </dd>
            </dl>
          </div>
        )}
      </>
    );
  }
}
