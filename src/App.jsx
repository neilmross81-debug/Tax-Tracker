import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calculator, TrendingUp, Download, Info, AlertTriangle, Calendar, Clock, Receipt, Settings, RefreshCw } from 'lucide-react';
import { calculateTax, projectAnnual, getTaxTrapAdvice, calculateOvertime } from './logic/TaxCalculator';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

function App() {
  // --- Persistent State ---
  const [taxCode, setTaxCode] = useState('1257L');
  const [baseSalary, setBaseSalary] = useState(45000);
  const [contractedHours, setContractedHours] = useState(37.5);
  const [pensionPercent, setPensionPercent] = useState(5);

  const [baseEnhancements, setBaseEnhancements] = useState([]);
  const [baseMonthlySacrifices, setBaseMonthlySacrifices] = useState([]);

  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
  const [months, setMonths] = useState(Array(12).fill(null).map(() => ({ income: [], overtime: [], deductions: [] })));

  // --- Persistence Logic ---
  useEffect(() => {
    const saved = localStorage.getItem('taxTrackerDataV5');
    if (saved) {
      const d = JSON.parse(saved);
      setTaxCode(d.taxCode || '1257L');
      setBaseSalary(d.baseSalary || 45000);
      setContractedHours(d.contractedHours || 37.5);
      setPensionPercent(d.pensionPercent || 5);
      setBaseEnhancements(d.baseEnhancements || []);
      setBaseMonthlySacrifices(d.baseMonthlySacrifices || []);
      setMonths(d.months || Array(12).fill(null).map(() => ({ income: [], overtime: [], deductions: [] })));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('taxTrackerDataV5', JSON.stringify({ taxCode, baseSalary, contractedHours, pensionPercent, baseEnhancements, baseMonthlySacrifices, months }));
  }, [taxCode, baseSalary, contractedHours, pensionPercent, baseEnhancements, baseMonthlySacrifices, months]);

  // --- Calculations ---
  const getFullMonthData = () => {
    const annualBaseEnhancements = baseEnhancements.reduce((s, e) => s + Number(e.amount), 0);
    const monthlySacrificeTotal = baseMonthlySacrifices.reduce((s, d) => s + Number(d.amount), 0);

    const monthlyBaseSalary = baseSalary / 12;
    const monthlyBaseEnhancement = annualBaseEnhancements / 12;

    return months.map(m => {
      const otTotal = m.overtime.reduce((s, o) => s + calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier), 0);
      const monthlyVariableIncome = m.income.reduce((s, i) => s + Number(i.amount), 0);

      const totalMonthlyGrossForPension = monthlyBaseSalary + monthlyBaseEnhancement + otTotal + monthlyVariableIncome;
      const pension = totalMonthlyGrossForPension * (pensionPercent / 100);

      return {
        income: [
          { name: 'Base Salary', amount: monthlyBaseSalary },
          { name: 'Base Enhancements', amount: monthlyBaseEnhancement },
          { name: 'Overtime Total', amount: otTotal },
          ...m.income
        ],
        deductions: [
          { name: 'Base Monthly Sacrifice', amount: monthlySacrificeTotal, type: 'salary_sacrifice' },
          { name: 'Pension', amount: pension, type: 'pension' },
          ...m.deductions
        ]
      };
    });
  };

  const fullData = getFullMonthData();
  const projection = projectAnnual(fullData, selectedMonthIdx, taxCode, baseSalary);
  const currentMonthData = fullData[selectedMonthIdx];
  const monthlyResults = calculateTax(
    currentMonthData.income.reduce((s, i) => s + Number(i.amount), 0),
    currentMonthData.deductions.reduce((s, i) => s + (i.type === 'pension' ? Number(i.amount) : 0), 0),
    currentMonthData.deductions.reduce((s, i) => s + (i.type === 'salary_sacrifice' ? Number(i.amount) : 0), 0),
    taxCode
  );

  const monthlyTaxFree = months[selectedMonthIdx].deductions.filter(d => d.type === 'tax_free').reduce((s, d) => s + Number(d.amount), 0);
  const totalMonthlyNet = monthlyResults.monthlyTakeHome + monthlyTaxFree;

  // --- Handlers ---
  const addBaseItem = (type) => {
    const newItem = { id: Date.now().toString(), name: 'New Item', amount: 0 };
    if (type === 'enhancement') setBaseEnhancements([...baseEnhancements, newItem]);
    else setBaseMonthlySacrifices([...baseMonthlySacrifices, newItem]);
  };

  const updateBaseItem = (type, id, field, val) => {
    const list = type === 'enhancement' ? [...baseEnhancements] : [...baseMonthlySacrifices];
    const updated = list.map(i => i.id === id ? { ...i, [field]: val } : i);
    if (type === 'enhancement') setBaseEnhancements(updated);
    else setBaseMonthlySacrifices(updated);
  };

  const removeBaseItem = (type, id) => {
    if (type === 'enhancement') setBaseEnhancements(baseEnhancements.filter(i => i.id !== id));
    else setBaseMonthlySacrifices(baseMonthlySacrifices.filter(i => i.id !== id));
  };

  const addMonthItem = (type) => {
    const n = [...months];
    const newItem = type === 'overtime'
      ? { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], reason: 'Work', hours: 0, multiplier: 1.5 }
      : { id: Date.now().toString(), name: 'Item', amount: 0, type: type === 'deductions' ? 'salary_sacrifice' : 'other' };
    n[selectedMonthIdx][type].push(newItem);
    setMonths(n);
  };

  const updateMonthItem = (type, id, field, val) => {
    const n = [...months];
    n[selectedMonthIdx][type] = n[selectedMonthIdx][type].map(i => i.id === id ? { ...i, [field]: val } : i);
    setMonths(n);
  };

  const removeMonthItem = (type, id) => {
    const n = [...months];
    n[selectedMonthIdx][type] = n[selectedMonthIdx][type].filter(i => i.id !== id);
    setMonths(n);
  };

  const clearCacheAndReload = () => {
    if (window.confirm("This will clear all non-saved data and force a fresh reload. Your saved salary data will be kept. Proceed?")) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (let registration of registrations) {
            registration.unregister();
          }
        });
      }
      localStorage.removeItem('taxTrackerDataV1'); // Cleanup old keys
      localStorage.removeItem('taxTrackerDataV2');
      localStorage.removeItem('taxTrackerDataV3');
      localStorage.removeItem('taxTrackerDataV4');
      window.location.reload(true);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>TaxTracker <span style={{ fontSize: '0.8rem' }}>v5.0 - PWA Fix & Base Sacrifices</span></h1>
        <p>UK Tax Year 2025/26 - Professional Grade</p>
      </header>

      {getTaxTrapAdvice(projection.taxableIncome).active && (
        <div className="glass-card" style={{ border: '1px solid var(--error)', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <AlertTriangle color="var(--error)" />
            <div><strong>Tax Trap Alert:</strong> {getTaxTrapAdvice(projection.taxableIncome).message} <p style={{ margin: 0, opacity: 0.8 }}>{getTaxTrapAdvice(projection.taxableIncome).advice}</p></div>
          </div>
        </div>
      )}

      {/* Base Settings & Annual Enhancements */}
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Settings size={20} /> Annual Config</h2>
        <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
          <div><label className="stat-label">Annual Salary</label><input type="number" value={baseSalary} onChange={(e) => setBaseSalary(Number(e.target.value))} className="input-field" /></div>
          <div><label className="stat-label">Contracted Hrs(wk)</label><input type="number" value={contractedHours} onChange={(e) => setContractedHours(Number(e.target.value))} className="input-field" /></div>
          <div><label className="stat-label">Tax Code</label><input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} className="input-field" /></div>
          <div><label className="stat-label">Base Pension %</label><input type="number" value={pensionPercent} onChange={(e) => setPensionPercent(Number(e.target.value))} className="input-field" /></div>
        </div>

        <div className="dashboard-grid">
          <div>
            <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>Annual Enhancements <Plus size={16} onClick={() => addBaseItem('enhancement')} style={{ cursor: 'pointer' }} /></div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Disturbance, Hourly Enhancements, etc. (Annual Amt)</div>
            {baseEnhancements.map(e => (
              <div key={e.id} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <input placeholder="Name" value={e.name} onChange={(v) => updateBaseItem('enhancement', e.id, 'name', v.target.value)} className="input-field" style={{ flex: 2 }} />
                <input type="number" placeholder="Annual Amt" value={e.amount} onChange={(v) => updateBaseItem('enhancement', e.id, 'amount', Number(v.target.value))} className="input-field" style={{ flex: 1 }} />
                <button className="btn-icon" onClick={() => removeBaseItem('enhancement', e.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div>
            <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>Monthly Salary Sacrifices <Plus size={16} onClick={() => addBaseItem('sacrifice')} style={{ cursor: 'pointer' }} /></div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Car, Cycle, Union Fees, etc. (Monthly Amt)</div>
            {baseMonthlySacrifices.map(d => (
              <div key={d.id} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <input placeholder="Name" value={d.name} onChange={(v) => updateBaseItem('sacrifice', d.id, 'name', v.target.value)} className="input-field" style={{ flex: 2 }} />
                <input type="number" placeholder="Monthly Amt" value={d.amount} onChange={(v) => updateBaseItem('sacrifice', d.id, 'amount', Number(v.target.value))} className="input-field" style={{ flex: 1 }} />
                <button className="btn-icon" onClick={() => removeBaseItem('sacrifice', d.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Monthly Split */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0 }}>Monthly Split</h2>
            <select className="input-field" style={{ width: 'auto' }} value={selectedMonthIdx} onChange={(e) => setSelectedMonthIdx(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>Overtime <Plus size={16} onClick={() => addMonthItem('overtime')} style={{ cursor: 'pointer' }} /></div>
            {months[selectedMonthIdx].overtime.map(o => (
              <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 0.7fr 0.8fr 24px', gap: '0.4rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                <input type="date" value={o.date} onChange={(e) => updateMonthItem('overtime', o.id, 'date', e.target.value)} className="input-field" style={{ fontSize: '0.7rem', padding: '0.2rem' }} />
                <input placeholder="Reason" value={o.reason} onChange={(e) => updateMonthItem('overtime', o.id, 'reason', e.target.value)} className="input-field" />
                <input type="number" placeholder="Hrs" value={o.hours} onChange={(e) => updateMonthItem('overtime', o.id, 'hours', Number(e.target.value))} className="input-field" />
                <select value={o.multiplier} onChange={(e) => updateMonthItem('overtime', o.id, 'multiplier', Number(e.target.value))} className="input-field">
                  <option value={1.5}>1.5x</option><option value={2}>2x</option>
                </select>
                <button className="btn-icon" style={{ color: 'var(--error)' }} onClick={() => removeMonthItem('overtime', o.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>

          <div>
            <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>Variable Items <Plus size={16} onClick={() => addMonthItem('deductions')} style={{ cursor: 'pointer' }} /></div>
            {months[selectedMonthIdx].deductions.map(d => (
              <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 24px', gap: '0.4rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                <input placeholder="Name" value={d.name} onChange={(e) => updateMonthItem('deductions', d.id, 'name', e.target.value)} className="input-field" />
                <input type="number" placeholder="Amt" value={d.amount} onChange={(e) => updateMonthItem('deductions', d.id, 'amount', Number(e.target.value))} className="input-field" />
                <select value={d.type} onChange={(e) => updateMonthItem('deductions', d.id, 'type', e.target.value)} className="input-field">
                  <option value="salary_sacrifice">Sacrifice</option><option value="tax_free">Expense (Tax Free)</option><option value="income">Income</option>
                </select>
                <button className="btn-icon" style={{ color: 'var(--error)' }} onClick={() => removeMonthItem('deductions', d.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="glass-card">
          <h2 style={{ margin: 0 }}>{MONTHS[selectedMonthIdx]} Projection</h2>
          <div className="stat-value" style={{ color: 'var(--success)', fontSize: '3rem' }}>£{totalMonthlyNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem', opacity: 0.7 }}>
            <div><div className="stat-label">Tax/NI</div>£{(monthlyResults.incomeTax / 12 + monthlyResults.ni / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div><div className="stat-label">Extra/Tax Free</div>£{monthlyTaxFree.toLocaleString()}</div>
          </div>
          <hr style={{ opacity: 0.1, margin: '1.5rem 0' }} />
          <h2 style={{ margin: 0 }}>Annual Forecast</h2>
          <div className="stat-value">£{projection.finalTakeHome.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Projected taxable income: £{projection.taxableIncome.toLocaleString()}</p>
        </div>
      </div>

      <footer style={{ marginTop: '3rem', textAlign: 'center', opacity: 0.4, fontSize: '0.8rem' }}>
        <p>TaxTracker v5.1 • Built for Precise Financial Planning</p>
        <button onClick={clearCacheAndReload} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', marginTop: '0.5rem', opacity: 0.6 }}>
          <RefreshCw size={12} style={{ marginRight: '0.3rem' }} /> Clear Cache & Force Update
        </button>
      </footer>
    </div>
  );
}

export default App;
