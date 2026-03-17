interface JsonViewProps {
  data: unknown;
}

export default function JsonView({ data }: JsonViewProps) {
  if (data === undefined || data === null) {
    return <pre className="json-view">null</pre>;
  }

  return (
    <pre className="json-view">{JSON.stringify(data, null, 2)}</pre>
  );
}
