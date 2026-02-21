import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calculator, TrendingUp, Download, Upload, Info } from 'lucide-react';
import { calculateTax, getPensionAdvice } from './logic/TaxCalculator';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

function App() {
  const [taxCode, setTaxCode] = useState('1257L');
  const [incomes, setIncomes] = useState([
    { id: '1', name: 'Basic Salary', amount: 45000, type: 'annual' },
    { id: '2', name: 'Overtime', amount: 2000, type: 'annual' },
    { id: '3', name: 'Disturbance Allowance', amount: 500, type: 'annual' }
  ]);
  const [pensionPercent, setPensionPercent] = useState(5);
  const [salarySacrifice, setSalarySacrifice] = useState(0);

  const totalGross = incomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
  const pensionAmount = totalGross * (pensionPercent / 100);
  const results = calculateTax(totalGross, pensionAmount, salarySacrifice);
  const advice = getPensionAdvice(totalGross, pensionPercent);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('taxTrackerData');
    if (saved) {
      const data = JSON.parse(saved);
      setIncomes(data.incomes);
      setTaxCode(data.taxCode);
      setPensionPercent(data.pensionPercent);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('taxTrackerData', JSON.stringify({ incomes, taxCode, pensionPercent }));
  }, [incomes, taxCode, pensionPercent]);

  const addIncome = () => {
    setIncomes([...incomes, { id: Date.now().toString(), name: 'New Item', amount: 0, type: 'annual' }]);
  };

  const removeIncome = (id) => {
    setIncomes(incomes.filter(inc => inc.id !== id));
  };

  const updateIncome = (id, field, value) => {
    setIncomes(incomes.map(inc => inc.id === id ? { ...inc, [field]: value } : inc));
  };

  const exportData = () => {
    const dataStr = JSON.stringify({ incomes, taxCode, pensionPercent });
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = 'tax_tracker_data.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const chartData = [
    { name: 'Take Home', value: results.takeHome, color: '#6366f1' },
    { name: 'Income Tax', value: results.incomeTax, color: '#ef4444' },
    { name: 'NI', value: results.ni, color: '#f59e0b' },
    { name: 'Pension', value: results.pensionContribution, color: '#22c55e' }
  ];

  return (
    <div className="app-container">
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2.5rem' }}>TaxTracker <span style={{ fontSize: '1rem', opacity: 0.6 }}>v2025.26</span></h1>
          <p style={{ color: 'var(--text-muted)' }}>Professional UK Salary & Tax Predictor</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportData} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--glass-bg)' }}>
            <Download size={18} /> Export
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        {/* Input Section */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calculator size={20} /> Income & Deductions
            </h2>
            <button onClick={addIncome} className="btn-primary" style={{ padding: '0.25rem 0.5rem' }}>
              <Plus size={18} />
            </button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="stat-label">Tax Code</label>
            <input
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
              className="input-field"
              placeholder="1257L"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {incomes.map(inc => (
              <div key={inc.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  value={inc.name}
                  onChange={(e) => updateIncome(inc.id, 'name', e.target.value)}
                  className="input-field"
                  style={{ flex: 2 }}
                />
                <input
                  type="number"
                  value={inc.amount}
                  onChange={(e) => updateIncome(inc.id, 'amount', e.target.value)}
                  className="input-field"
                  style={{ flex: 1 }}
                />
                <button onClick={() => removeIncome(inc.id)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}>
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <label className="stat-label">Pension Contribution (%)</label>
            <input
              type="number"
              value={pensionPercent}
              onChange={(e) => setPensionPercent(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        {/* Results Summary */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div className="stat-label">Monthly Take Home</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>£{results.monthlyTakeHome.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div className="stat-label">Annual Tax</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>£{results.incomeTax.toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-label">Annual NI</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>£{results.ni.toLocaleString()}</div>
            </div>
          </div>

          <div style={{ height: '200px', marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: 'white' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Advisor Section */}
        <div className="glass-card" style={{ gridColumn: 'span 1' }}>
          <h2 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={20} /> Optimization Advice
          </h2>
          <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '0.5rem', border: '1px solid var(--primary)' }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              Increasing your pension by <strong>1%</strong> would cost you
              <span style={{ color: 'var(--error)', fontWeight: 600 }}> £{advice.costOfOnePercent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> in take-home pay,
              but add <span style={{ color: 'var(--success)', fontWeight: 600 }}>£{advice.gainInPension.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> to your pension pot.
            </p>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', opacity: 0.8 }}>
              That's an efficiency of <strong>{advice.efficiency}x</strong>!
            </div>
          </div>

          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <Info size={16} className="text-primary" style={{ marginTop: '2px' }} />
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {results.taxableIncome > 100000
                  ? "Your income is over £100k. Increasing pension contributions now is highly beneficial as it helps recover your Personal Allowance."
                  : "You're in a stable tax bracket. Standard pension contributions are recommended for long-term growth."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
