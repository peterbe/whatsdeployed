import React from 'react';
import PropTypes from 'prop-types';
import { Progress } from 'reactstrap';

export default class AutoProgressBar extends React.Component {
  static propTypes = {
    done: PropTypes.number,
    total: PropTypes.number,
    targetTime: PropTypes.number,
    auto: PropTypes.bool,
    autoTickRate: PropTypes.number
  };

  static defaultProps = {
    targetTime: 5000,
    auto: true,
    autoTickRate: 100
  };

  constructor(props) {
    super(props);
    this.state = {
      autoCounter: 0
    };
    this.interval = null;
  }

  componentDidMount() {
    this.interval = setInterval(() => this.tick(), this.props.autoTickRate);
    this.setState({ autoCounter: 0 });
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  tick() {
    const { autoTickRate, targetTime } = this.props;
    this.setState(state => {
      const next = state.autoCounter + autoTickRate;
      if (next > targetTime) {
        clearInterval(this.interval);
      }
      return { autoCounter: next };
    });
  }

  render() {
    const { auto, done, total, targetTime } = this.props;
    const { autoCounter } = this.state;
    let displayedProgress = 0;
    if (done && total) {
      displayedProgress = Math.max(displayedProgress, done / total);
    }
    if (auto) {
      let fakeProgress = autoCounter / targetTime;
      displayedProgress = Math.max(displayedProgress, fakeProgress);
    }
    if (displayedProgress > 1) {
      displayedProgress = 1;
    }

    return (
      <Progress
        animated
        color="success"
        striped
        value={displayedProgress}
        max={1}
      >
        {displayedProgress >= 0.99 && "This is taking a while..."}
      </Progress>
    );
  }
}
