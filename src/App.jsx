import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calculator, TrendingUp, Download, Info, AlertTriangle, Calendar } from 'lucide-react';
import { calculateTax, projectAnnual, getTaxTrapAdvice } from './logic/TaxCalculator';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const MONTHS = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

function App() {
  // --- Persistent State ---
  const [taxCode, setTaxCode] = useState('1257L');
  const [baseSalary, setBaseSalary] = useState(45000);
  const [pensionPercent, setPensionPercent] = useState(5);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(new Date().getMonth() === 3 ? 0 : (new Date().getMonth() + 9) % 12); // Default to current tax month

  const [months, setMonths] = useState(() => {
    // Initialize 12 empty months
    return Array(12).fill(null).map(() => ({
      income: [],
      deductions: []
    }));
  });

  // --- Persistence Logic ---
  useEffect(() => {
    const saved = localStorage.getItem('taxTrackerDataV2');
    if (saved) {
      const data = JSON.parse(saved);
      setTaxCode(data.taxCode || '1257L');
      setBaseSalary(data.baseSalary || 45000);
      setPensionPercent(data.pensionPercent || 5);
      setMonths(data.months || Array(12).fill(null).map(() => ({ income: [], deductions: [] })));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('taxTrackerDataV2', JSON.stringify({ taxCode, baseSalary, pensionPercent, months }));
  }, [taxCode, baseSalary, pensionPercent, months]);

  // --- Calculations ---
  // We construct a temporary "full months" array that includes the base salary for calculation
  const getFullMonthData = () => {
    return months.map(m => ({
      income: [{ name: 'Base Salary', amount: baseSalary / 12 }, ...m.income],
      deductions: [
        { name: 'Pension', amount: (baseSalary / 12) * (pensionPercent / 100), type: 'pension' },
        ...m.deductions
      ]
    }));
  };

  const fullMonthsData = getFullMonthData();
  const projection = projectAnnual(fullMonthsData, selectedMonthIdx);
  const currentMonthResults = calculateTax(
    fullMonthsData[selectedMonthIdx].income.reduce((s, i) => s + Number(i.amount), 0),
    fullMonthsData[selectedMonthIdx].deductions.reduce((s, i) => s + (i.type === 'pension' ? Number(i.amount) : 0), 0),
    fullMonthsData[selectedMonthIdx].deductions.reduce((s, i) => s + (i.type !== 'pension' ? Number(i.amount) : 0), 0)
  );

  const taxTrap = getTaxTrapAdvice(projection.taxableIncome);

  // --- Handlers ---
  const updateMonthItem = (type, itemId, field, value) => {
    const newMonths = [...months];
    newMonths[selectedMonthIdx][type] = newMonths[selectedMonthIdx][type].map(item =>
      item.id === itemId ? { ...item, [field]: value } : item
    );
    setMonths(newMonths);
  };

  const addMonthItem = (type) => {
    const newMonths = [...months];
    newMonths[selectedMonthIdx][type].push({ id: Date.now().toString(), name: 'New Item', amount: 0, type: type === 'deductions' ? 'other' : undefined });
    setMonths(newMonths);
  };

  const removeMonthItem = (type, itemId) => {
    const newMonths = [...months];
    newMonths[selectedMonthIdx][type] = newMonths[selectedMonthIdx][type].filter(i => i.id !== itemId);
    setMonths(newMonths);
  };

  const exportData = () => {
    const dataStr = JSON.stringify({ taxCode, baseSalary, pensionPercent, months });
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `tax_tracker_backup_${new Date().toISOString().split('T')[0]}.json`);
    linkElement.click();
  };

  // --- Chart Data ---
  const chartData = [
    { name: 'Take Home', value: projection.takeHome, color: '#6366f1' },
    { name: 'Income Tax', value: projection.incomeTax, color: '#ef4444' },
    { name: 'NI', value: projection.ni, color: '#f59e0b' },
    { name: 'Deductions', value: projection.pensionContribution + projection.salarySacrifice, color: '#22c55e' }
  ];

  return (
    <div className="app-container">
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2.5rem' }}>TaxTracker <span style={{ fontSize: '1rem', opacity: 0.6 }}>v2025.26</span></h1>
          <p style={{ color: 'var(--text-muted)' }}>Precision Salary & Tax Forecaster</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button onClick={exportData} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--glass-bg)' }}>
            <Download size={18} /> Export
          </button>
        </div>
      </header>

      {/* Tax Trap Alert */}
      {taxTrap.active && (
        <div className="glass-card" style={{ marginBottom: '2rem', border: '1px solid var(--error)', background: 'rgba(239, 68, 68, 0.1)' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <AlertTriangle color="var(--error)" size={32} />
            <div>
              <h3 style={{ margin: 0, color: 'var(--error)' }}>Tax Trap Detected!</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>{taxTrap.message}</p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', opacity: 0.8 }}>{taxTrap.advice}</p>
            </div>
          </div>
        </div>
      )}

      {/* Base Salary Config */}
      <div className="glass-card" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div>
          <label className="stat-label">Annual Base Salary</label>
          <input
            type="number"
            value={baseSalary}
            onChange={(e) => setBaseSalary(Number(e.target.value))}
            className="input-field"
          />
        </div>
        <div>
          <label className="stat-label">Base Pension %</label>
          <input
            type="number"
            value={pensionPercent}
            onChange={(e) => setPensionPercent(Number(e.target.value))}
            className="input-field"
          />
        </div>
        <div>
          <label className="stat-label">Tax Code</label>
          <input
            value={taxCode}
            onChange={(e) => setTaxCode(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Monthly Input Section */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={20} /> Monthly Variables
            </h2>
            <select
              value={selectedMonthIdx}
              onChange={(e) => setSelectedMonthIdx(Number(e.target.value))}
              className="input-field"
              style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
            >
              {MONTHS.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span className="stat-label">Extra Income</span>
              <button onClick={() => addMonthItem('income')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
                <Plus size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {months[selectedMonthIdx].income.map(item => (
                <div key={item.id} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input value={item.name} onChange={(e) => updateMonthItem('income', item.id, 'name', e.target.value)} className="input-field" style={{ flex: 2 }} />
                  <input type="number" value={item.amount} onChange={(e) => updateMonthItem('income', item.id, 'amount', e.target.value)} className="input-field" style={{ flex: 1 }} />
                  <button onClick={() => removeMonthItem('income', item.id)} style={{ color: 'var(--error)', background: 'none', border: 'none' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span className="stat-label">Extra Deductions</span>
              <button onClick={() => addMonthItem('deductions')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
                <Plus size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {months[selectedMonthIdx].deductions.map(item => (
                <div key={item.id} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input value={item.name} onChange={(e) => updateMonthItem('deductions', item.id, 'name', e.target.value)} className="input-field" style={{ flex: 2 }} />
                  <input type="number" value={item.amount} onChange={(e) => updateMonthItem('deductions', item.id, 'amount', e.target.value)} className="input-field" style={{ flex: 1 }} />
                  <button onClick={() => removeMonthItem('deductions', item.id)} style={{ color: 'var(--error)', background: 'none', border: 'none' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Projections Card */}
        <div className="glass-card">
          <h2 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={20} /> Year-End Forecast
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <div className="stat-label">Projected Take Home</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>£{projection.takeHome.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div className="stat-label">Projected Gross</div>
              <div className="stat-value">£{projection.gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
          </div>

          <div style={{ height: '220px', marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: 'white' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Result Summary */}
        <div className="glass-card" style={{ gridColumn: 'span 1' }}>
          <h2 style={{ margin: '0 0 1rem 0' }}>{MONTHS[selectedMonthIdx]} Summary</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '0.5rem' }}>
              <div className="stat-label">Net Pay for {MONTHS[selectedMonthIdx]}</div>
              <div style={{ fontSize: '2rem', fontWeight: 800 }}>£{currentMonthResults.monthlyTakeHome.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div className="stat-label">Tax</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>£{(currentMonthResults.incomeTax / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="stat-label">NI</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>£{(currentMonthResults.ni / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
