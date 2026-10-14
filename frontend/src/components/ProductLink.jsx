export default function ProductLink({ id, name, onOpen }) {
  if (!id) return '-';
  return (
    <>
      <button className="link" onClick={() => onOpen(id)} title="Open this product's stock history">{id}</button>
      {name ? ' ' + name : ''}
    </>
  );
}
