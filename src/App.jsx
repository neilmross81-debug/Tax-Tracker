import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calculator, TrendingUp, Download, Info, AlertTriangle, Calendar, Clock, Receipt } from 'lucide-react';
import { calculateTax, projectAnnual, getTaxTrapAdvice, calculateOvertime } from './logic/TaxCalculator';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

function App() {
  const [taxCode, setTaxCode] = useState('1257L');
  const [baseSalary, setBaseSalary] = useState(45000);
  const [contractedHours, setContractedHours] = useState(37.5);
  const [pensionPercent, setPensionPercent] = useState(5);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
  const [months, setMonths] = useState(Array(12).fill(null).map(() => ({ income: [], overtime: [], deductions: [] })));

  useEffect(() => {
    const saved = localStorage.getItem('taxTrackerDataV3');
    if (saved) {
      const d = JSON.parse(saved);
      setTaxCode(d.taxCode || '1257L');
      setBaseSalary(d.baseSalary || 45000);
      setContractedHours(d.contractedHours || 37.5);
      setPensionPercent(d.pensionPercent || 5);
      setMonths(d.months || Array(12).fill(null).map(() => ({ income: [], overtime: [], deductions: [] })));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('taxTrackerDataV3', JSON.stringify({ taxCode, baseSalary, contractedHours, pensionPercent, months }));
  }, [taxCode, baseSalary, contractedHours, pensionPercent, months]);

  const getFullMonthData = () => {
    return months.map(m => {
      const otTotal = m.overtime.reduce((s, o) => s + calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier), 0);
      const otherIncome = m.income.reduce((s, i) => s + Number(i.amount), 0);
      const monthlyBase = baseSalary / 12;

      const pension = (monthlyBase + otTotal + otherIncome) * (pensionPercent / 100);

      return {
        income: [{ name: 'Base Salary', amount: monthlyBase }, { name: 'Overtime Total', amount: otTotal }, ...m.income],
        deductions: [{ name: 'Pension', amount: pension, type: 'pension' }, ...m.deductions]
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

  const addItem = (type) => {
    const n = [...months];
    const newItem = type === 'overtime'
      ? { id: Date.now().toString(), reason: 'Work', hours: 0, multiplier: 1.5 }
      : { id: Date.now().toString(), name: 'Item', amount: 0, type: type === 'deductions' ? 'salary_sacrifice' : 'other' };
    n[selectedMonthIdx][type].push(newItem);
    setMonths(n);
  };

  const updateItem = (type, id, field, val) => {
    const n = [...months];
    n[selectedMonthIdx][type] = n[selectedMonthIdx][type].map(i => i.id === id ? { ...i, [field]: val } : i);
    setMonths(n);
  };

  return (
    <div className="app-container">
      <header>
        <h1>TaxTracker <span style={{ fontSize: '0.8rem' }}>v3.0 - Overtime & Projections</span></h1>
        <p>UK Tax Year 2025/26 - Professional Grade</p>
      </header>

      {/* Advice Header */}
      {getTaxTrapAdvice(projection.taxableIncome).active && (
        <div className="glass-card" style={{ border: '1px solid var(--error)', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <AlertTriangle color="var(--error)" />
            <div><strong>Tax Trap Alert:</strong> {getTaxTrapAdvice(projection.taxableIncome).message} <p style={{ margin: 0, opacity: 0.8 }}>{getTaxTrapAdvice(projection.taxableIncome).advice}</p></div>
          </div>
        </div>
      )}

      {/* Base Settings */}
      <div className="glass-card dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div><label className="stat-label">Annual Salary</label><input type="number" value={baseSalary} onChange={(e) => setBaseSalary(Number(e.target.value))} className="input-field" /></div>
        <div><label className="stat-label">Contracted Hrs(wk)</label><input type="number" value={contractedHours} onChange={(e) => setContractedHours(Number(e.target.value))} className="input-field" /></div>
        <div><label className="stat-label">Tax Code</label><input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} className="input-field" /></div>
        <div><label className="stat-label">Pension %</label><input type="number" value={pensionPercent} onChange={(e) => setPensionPercent(Number(e.target.value))} className="input-field" /></div>
      </div>

      <div className="dashboard-grid">
        {/* Monthly Tracker */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Monthly Split</h2>
            <select className="input-field" style={{ width: 'auto' }} value={selectedMonthIdx} onChange={(e) => setSelectedMonthIdx(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between' }}>Overtime <Plus size={16} onClick={() => addItem('overtime')} style={{ cursor: 'pointer' }} /></div>
            {months[selectedMonthIdx].overtime.map(o => (
              <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 20px', gap: '0.4rem', marginTop: '0.5rem', alignItems: 'center' }}>
                <input placeholder="Reason" value={o.reason} onChange={(e) => updateItem('overtime', o.id, 'reason', e.target.value)} className="input-field" />
                <input type="number" placeholder="Hrs" value={o.hours} onChange={(e) => updateItem('overtime', o.id, 'hours', Number(e.target.value))} className="input-field" />
                <select value={o.multiplier} onChange={(e) => updateItem('overtime', o.id, 'multiplier', Number(e.target.value))} className="input-field">
                  <option value={1.5}>1.5x</option><option value={2}>2x</option>
                </select>
                <Trash2 size={16} color="var(--error)" onClick={() => { const n = [...months]; n[selectedMonthIdx].overtime = n[selectedMonthIdx].overtime.filter(i => i.id !== o.id); setMonths(n); }} />
              </div>
            ))}
          </div>

          <div>
            <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between' }}>Expenses & Deductions <Plus size={16} onClick={() => addItem('deductions')} style={{ cursor: 'pointer' }} /></div>
            {months[selectedMonthIdx].deductions.map(d => (
              <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 20px', gap: '0.4rem', marginTop: '0.5rem', alignItems: 'center' }}>
                <input placeholder="Name" value={d.name} onChange={(e) => updateItem('deductions', d.id, 'name', e.target.value)} className="input-field" />
                <input type="number" placeholder="Amt" value={d.amount} onChange={(e) => updateItem('deductions', d.id, 'amount', Number(e.target.value))} className="input-field" />
                <select value={d.type} onChange={(e) => updateItem('deductions', d.id, 'type', e.target.value)} className="input-field">
                  <option value="salary_sacrifice">Sacrifice</option><option value="tax_free">Expense (Tax Free)</option><option value="other">Other</option>
                </select>
                <Trash2 size={16} color="var(--error)" onClick={() => { const n = [...months]; n[selectedMonthIdx].deductions = n[selectedMonthIdx].deductions.filter(i => i.id !== d.id); setMonths(n); }} />
              </div>
            ))}
          </div>
        </div>

        {/* Results Card */}
        <div className="glass-card">
          <h2 style={{ margin: 0 }}>{MONTHS[selectedMonthIdx]} Net Pay</h2>
          <div className="stat-value" style={{ color: 'var(--success)', fontSize: '3rem' }}>£{totalMonthlyNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem', opacity: 0.7 }}>
            <div><div className="stat-label">Tax/NI</div>£{(monthlyResults.incomeTax / 12 + monthlyResults.ni / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div><div className="stat-label">Exp/Tax Free</div>£{monthlyTaxFree.toLocaleString()}</div>
          </div>
          <hr style={{ opacity: 0.1, margin: '1.5rem 0' }} />
          <h2 style={{ margin: 0 }}>Annual Forecast</h2>
          <div className="stat-value">£{projection.finalTakeHome.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Projected taxable income: £{projection.taxableIncome.toLocaleString()}</p>
        </div>
      </div>
      <footer style={{ marginTop: '3rem', textAlign: 'center', opacity: 0.4, fontSize: '0.8rem' }}>
        TaxTracker v3.1 • Deployment Sync: {new Date().toLocaleTimeString()} • Press <strong>Ctrl+F5</strong> (PC) or <strong>Cmd+Shift+R</strong> (Mac) to force update.
      </footer>
    </div>
  );
}

export default App;
