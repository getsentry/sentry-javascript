import { Component, h } from 'preact';

export class ScreenshotButton extends Component {
  state = { clicked: false };
  handleClick = () => {
    this.setState({ clicked: !this.state.clicked });
  };
  render() {
    return (
      <label htmlFor="screenshot" className="form__label">
        <span className="form__label__text">Screenshot</span>
        <button class="btn btn--default" type="screenshot" onClick={this.handleClick}>
          {this.state.clicked ? 'Remove' : 'Add'}
        </button>
      </label>
    );
  }
}
