export function Loading({ what }) {
  return (
    <div className="status" role="status">
      <span className="spinner" />
      Loading {what}...
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="status status-error" role="alert">
      <strong>Could not load this view.</strong>
      <span>{message}</span>
      <button onClick={onRetry}>Try again</button>
    </div>
  );
}
