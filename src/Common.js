import React from 'react';

export class EllipsisLoading extends React.PureComponent {
  state = { dots: 0 };
  static defaultProps = {
    text: 'Loading',
    animationMs: 400,
    maxDots: 5
  };
  componentDidMount() {
    this.interval = window.setInterval(() => {
      this.setState(state => {
        return { dots: (state.dots + 1) % this.props.maxDots };
      });
    }, this.props.animationMs);
  }
  componentWillUnmount() {
    window.clearInterval(this.interval);
  }
  render() {
    let dots = '.'.repeat(this.state.dots + 1);
    return `${this.props.text}${dots}`;
  }
}
