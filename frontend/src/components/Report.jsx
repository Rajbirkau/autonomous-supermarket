import BusinessPerformance from './BusinessPerformance.jsx';
import OperationsPart from './OperationsPart.jsx';

export default function Report({ report, onOpenDay, onOpenProduct }) {
  return (
    <>
      <div className="jump">
        <span className="muted">Jump to:</span>
        <a href="#part1">Part 1 - Business performance</a>
        <a href="#part2">Part 2 - Inventory and Store Brain operations</a>
      </div>
      <BusinessPerformance business={report.business} onOpenDay={onOpenDay} onOpenProduct={onOpenProduct} />
      <OperationsPart operations={report.operations} onOpenDay={onOpenDay} onOpenProduct={onOpenProduct} />
    </>
  );
}
