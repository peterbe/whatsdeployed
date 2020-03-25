import React from 'react';
import {
  Switch,
  Redirect,
  Route,
  withRouter as originalWithRouter,
} from 'react-router-dom';

import SetupPage from './SetupPage';
import DeployPage from './DeployPage';
import LongUrlRedirect from './LongUrlRedirect';

const Routes = withRouter(({ location }) => {
  if (location.search) {
    return <LongUrlRedirect />;
  }

  return (
    <Switch>
      <Redirect from="/s-:code(.*)" to="/s/:code" />
      <Route path="/s/:code/:owner/:repo" component={DeployPage} />
      <Route path="/s/:code" component={DeployPage} />
      <Route path="/" exact component={SetupPage} />
    </Switch>
  );
});

export default Routes;

export function withRouter(Component) {
  return originalWithRouter((props) => {
    props.location.searchParams = new URLSearchParams(props.location.search);
    return <Component {...props} />;
  });
}
