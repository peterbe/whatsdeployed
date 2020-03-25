import React from 'react';
import PropTypes from 'prop-types';

import AutoProgressBar from './AutoProgressBar';
import shortUrls from './shortUrls';
import { withRouter } from './Routes';

class LongUrlRedirect extends React.Component {
  state = {
    error: null,
  };

  static propsTypes = {
    owner: PropTypes.string,
    repo: PropTypes.string,
    deployments: PropTypes.arrayOf(
      PropTypes.shape({
        url: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
      })
    ),
  };

  async shorten(props = this.props) {
    const { location, history } = this.props;

    const owner = location.searchParams.get('owner');
    const repo = location.searchParams.get('repo');

    const names = location.searchParams.getAll('name[]');
    const urls = location.searchParams.getAll('url[]');
    const deployments = names.map((name, idx) => ({ name, url: urls[idx] }));

    try {
      let longUrl = shortUrls.buildLongUrl({ owner, repo, deployments });
      longUrl = longUrl.pathname + longUrl.search;
      const shortUrl = await shortUrls.fetchFor(longUrl);
      const code = shortUrl.slice(3);
      history.replace({
        pathname: `/s/${code}`,
        search: '',
        hash: '',
        state: null,
      });
    } catch (error) {
      this.setState({ error });
    }
  }

  componentDidMount() {
    this.shorten();
  }

  componentWillReceiveProps(newProps) {
    this.shorten(newProps);
  }

  render() {
    const { owner, repo } = this.props;
    const { error } = this.state;

    document.title = `What's Deployed on ${owner}/${repo}?`;

    if (error) {
      return <div className="alert alert-danger">{error.toString()}</div>;
    }

    return (
      <div>
        <span>Loading parameters</span>
        <AutoProgressBar count={0} total={3} targetTime={5000} />
      </div>
    );
  }
}

export default withRouter(LongUrlRedirect);
