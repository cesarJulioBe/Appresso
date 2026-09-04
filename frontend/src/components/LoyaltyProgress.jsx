import { useEffect, useState } from 'react';
import { fetchLoyaltyProgression } from '../api';

function LoyaltyProgress() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchLoyaltyProgression().then(setData).catch(console.error);
  }, []);

  if (!data) return <p className="text-sm text-neutral-500">Cargando…</p>;

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-1">Programa de fidelización</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Progresión aritmética: inicia en {data.firstTerm} productos, aumenta {data.commonDifference} cada semana.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {data.results.map((r) => (
          <div key={r.target} className="border border-neutral-200 rounded-md p-3 text-center">
            <p className="text-2xl font-semibold">{r.target}</p>
            <p className="text-xs text-neutral-500">productos</p>
            <p className="text-sm mt-2">Semana <span className="font-semibold">{r.week}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default LoyaltyProgress;