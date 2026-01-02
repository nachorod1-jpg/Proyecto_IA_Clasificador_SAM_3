interface Props {
  processed?: number;
  total?: number;
}

const ProgressBar = ({ processed = 0, total = 0 }: Props) => {
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs text-gray-600">
        <span>{processed} procesadas</span>
        <span>{total} totales</span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-200">
        <div className="h-3 rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 text-right text-xs font-semibold text-blue-700">{percent}%</div>
    </div>
  );
};

export default ProgressBar;
