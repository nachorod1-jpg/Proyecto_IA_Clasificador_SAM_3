interface Props {
  error: Error | null;
}

const ApiErrorDisplay = ({ error }: Props) => {
  if (!error) return null;
  return (
    <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
      {error.message || 'Se produjo un error inesperado.'}
    </div>
  );
};

export default ApiErrorDisplay;
