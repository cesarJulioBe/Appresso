import { useState } from 'react';
import { TextField, Label, Input, Button } from '@heroui/react';
import { predictSales } from '../api';

function SalesPrediction() {
  const [history, setHistory] = useState([10, 13, 9, 15, 18, 20, 19]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  function updateDay(index, value) {
    const updated = [...history];
    updated[index] = parseFloat(value) || 0;
    setHistory(updated);
  }

  async function handleCalculate() {
    setLoading(true);
    try {
      const data = await predictSales(history);
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-1">Predicción de ventas</h2>
      <p className="text-sm text-neutral-500 mb-4">Regresión lineal — ingresa las ventas de los últimos 7 días</p>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {history.map((value, i) => (
          <TextField key={i} value={String(value)} onChange={(v) => updateDay(i, v)}>
            <Label>Día {i + 1}</Label>
            <Input type="number" className="w-full min-w-0 px-1 text-center text-sm" />
          </TextField>
        ))}
      </div>

      <Button onPress={handleCalculate} isDisabled={loading}>
        {loading ? 'Calculando…' : 'Calcular predicción'}
      </Button>

      {result && (
        <div className="mt-4">
          <p className="text-sm text-neutral-500 mb-2">
            Tendencia: {result.slope.toFixed(2)} unidades/día
          </p>
          <div className="grid grid-cols-3 gap-3">
            {result.predictions.map((p) => (
              <div key={p.days} className="border border-neutral-200 rounded-md p-3 text-center">
                <p className="text-xs text-neutral-500">En {p.days} día(s)</p>
                <p className="text-2xl font-semibold">{p.predictedSales.toFixed(1)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SalesPrediction;