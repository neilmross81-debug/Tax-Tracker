import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Calculator, TrendingUp, Download, Info, AlertTriangle, Calendar, Clock, Receipt, Settings, RefreshCw, LayoutDashboard, CheckSquare, Square } from 'lucide-react';
import { calculateTax, projectAnnual, getTaxTrapAdvice, calculateOvertime, recommendTaxCode, parseTaxCode } from './logic/TaxCalculator';

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

function App() {
  // --- UI State ---
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, overtime, config
  const [otFilterClaimed, setOtFilterClaimed] = useState('all'); // all, claimed, unclaimed
  const [otFilterMonth, setOtFilterMonth] = useState('all');

  // --- Persistent State ---
  const [taxCode, setTaxCode] = useState('1257L');
  const [baseSalary, setBaseSalary] = useState(45000);
  const [contractedHours, setContractedHours] = useState(37.5);
  const [pensionPercent, setPensionPercent] = useState(5);

  const [baseEnhancements, setBaseEnhancements] = useState([]);
  const [baseSacrifices, setBaseSacrifices] = useState([]);

  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
  const [months, setMonths] = useState(Array(12).fill(null).map(() => ({ income: [], overtime: [], deductions: [] })));

  // --- Persistence Logic ---
  useEffect(() => {
    const saved = localStorage.getItem('taxTrackerDataV10_1');
    if (saved) {
      const d = JSON.parse(saved);
      setTaxCode(d.taxCode || '1257L');
      setBaseSalary(d.baseSalary || 45000);
      setContractedHours(d.contractedHours || 37.5);
      setPensionPercent(d.pensionPercent || 5);
      setBaseEnhancements(d.baseEnhancements || []);
      setBaseSacrifices(d.baseSacrifices || []);
      setMonths(d.months || Array(12).fill(null).map(() => ({ income: [], overtime: [], deductions: [] })));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('taxTrackerDataV10_1', JSON.stringify({ taxCode, baseSalary, contractedHours, pensionPercent, baseEnhancements, baseSacrifices, months }));
  }, [taxCode, baseSalary, contractedHours, pensionPercent, baseEnhancements, baseSacrifices, months]);

  // --- Helpers ---
  const getMonthlyValue = (amount, frequency) => {
    if (frequency === 'monthly') return Number(amount) || 0;
    if (frequency === 'annual') return (Number(amount) || 0) / 12;
    if (frequency === 'hourly') return ((Number(amount) || 0) * contractedHours * 52) / 12;
    return Number(amount) || 0;
  };

  const handleNumericInput = (val, setter) => {
    if (val === '') {
      setter('');
      return;
    }
    const num = Number(val);
    if (!isNaN(num)) setter(num);
  };

  // --- Calculations ---

  // 1. Recurring Base for future projection
  const futureBaseData = useMemo(() => {
    const monthlyBaseSalary = baseSalary / 12;
    const baseEnhancementMonthly = baseEnhancements.reduce((s, e) => s + getMonthlyValue(e.amount, e.frequency), 0);
    const grossBaseSacrificeMonthly = baseSacrifices.filter(d => d.type !== 'net_sacrifice').reduce((s, d) => s + getMonthlyValue(d.amount, d.frequency), 0);
    const netBaseSacrificeMonthly = baseSacrifices.filter(d => d.type === 'net_sacrifice').reduce((s, d) => s + getMonthlyValue(d.amount, d.frequency), 0);

    const grossForPension = monthlyBaseSalary + baseEnhancementMonthly;
    const pension = grossForPension * (pensionPercent / 100);

    return {
      gross: monthlyBaseSalary + baseEnhancementMonthly,
      pension: pension,
      grossSacrifice: grossBaseSacrificeMonthly,
      netSacrifice: netBaseSacrificeMonthly,
      taxFree: 0
    };
  }, [baseSalary, baseEnhancements, baseSacrifices, pensionPercent, contractedHours]);

  // 2. Prepare Actual Month Data (April to selected month)
  const monthsActualData = useMemo(() => {
    const baseEnhancementMonthlyTotal = baseEnhancements.reduce((s, e) => s + getMonthlyValue(e.amount, e.frequency), 0);
    const grossBaseSacrificeMonthlyTotal = baseSacrifices.filter(d => d.type !== 'net_sacrifice').reduce((s, d) => s + getMonthlyValue(d.amount, d.frequency), 0);
    const netBaseSacrificeMonthlyTotal = baseSacrifices.filter(d => d.type === 'net_sacrifice').reduce((s, d) => s + getMonthlyValue(d.amount, d.frequency), 0);
    const monthlyBaseSalary = baseSalary / 12;

    return months.map(m => {
      const otTotal = m.overtime.reduce((s, o) => s + calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier), 0);
      const varGrossIncome = m.income.reduce((s, i) => s + (Number(i.amount) || 0), 0) + m.deductions.filter(d => d.type === 'income').reduce((s, d) => s + (Number(d.amount) || 0), 0);

      const totalMonthlyGrossForPension = monthlyBaseSalary + baseEnhancementMonthlyTotal + otTotal + varGrossIncome;
      const pension = totalMonthlyGrossForPension * (pensionPercent / 100);

      const varGrossSacrifice = m.deductions.filter(d => d.type === 'salary_sacrifice').reduce((s, d) => s + (Number(d.amount) || 0), 0);
      const varNetDeduction = m.deductions.filter(d => d.type === 'net_sacrifice').reduce((s, d) => s + (Number(d.amount) || 0), 0);
      const varTaxFree = m.deductions.filter(d => d.type === 'tax_free').reduce((s, d) => s + (Number(d.amount) || 0), 0);

      return {
        income: [
          { name: 'Base Salary', amount: monthlyBaseSalary },
          { name: 'Base Enhancements', amount: baseEnhancementMonthlyTotal },
          { name: 'Overtime', amount: otTotal },
          ...m.income,
          ...m.deductions.filter(d => d.type === 'income')
        ],
        deductions: [
          { name: 'Base Gross Sacrifices', amount: grossBaseSacrificeMonthlyTotal, type: 'salary_sacrifice' },
          { name: 'Pension', amount: pension, type: 'pension' },
          ...m.deductions.filter(d => d.type === 'salary_sacrifice'),
          { name: 'Base Net Sacrifices', amount: netBaseSacrificeMonthlyTotal, type: 'net_sacrifice' },
          ...m.deductions.filter(d => d.type === 'net_sacrifice')
        ],
        taxFree: varTaxFree
      };
    });
  }, [months, baseSalary, contractedHours, pensionPercent, baseEnhancements, baseSacrifices]);

  // 3. Projections
  const projection = projectAnnual(monthsActualData, futureBaseData, selectedMonthIdx, taxCode);

  // 4. Current Selected Month Summary Logic
  // IMPORTANT: We scale current month values to annual to get the correct marginal tax impact, then divide back.
  const currentMonthFull = monthsActualData[selectedMonthIdx];
  const monthlyGross = currentMonthFull.income.reduce((s, i) => s + Number(i.amount || 0), 0);
  const monthlyPension = currentMonthFull.deductions.find(d => d.type === 'pension')?.amount || 0;
  const monthlyGrossSacrifice = currentMonthFull.deductions.filter(d => d.type === 'salary_sacrifice').reduce((s, i) => s + Number(i.amount || 0), 0);
  const monthlyNetSacrifice = currentMonthFull.deductions.filter(d => d.type === 'net_sacrifice').reduce((s, i) => s + Number(i.amount || 0), 0);

  const monthlyResultsAnnualized = calculateTax(
    monthlyGross * 12,
    monthlyPension * 12,
    monthlyGrossSacrifice * 12,
    taxCode,
    monthlyNetSacrifice * 12
  );

  const totalMonthlyNet = (monthlyResultsAnnualized.annualTakeHome / 12) + currentMonthFull.taxFree;

  // Overtime Processing
  const allOvertime = useMemo(() => {
    return months.flatMap((m, idx) => m.overtime.map(o => ({ ...o, monthIdx: idx, monthName: MONTHS[idx] })));
  }, [months]);

  const ytdOTTotal = allOvertime.reduce((acc, o) => acc + calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier), 0);

  const filteredOT = allOvertime.filter(o => {
    if (otFilterClaimed === 'claimed' && !o.claimed) return false;
    if (otFilterClaimed === 'unclaimed' && o.claimed) return false;
    if (otFilterMonth !== 'all' && Number(otFilterMonth) !== o.monthIdx) return false;
    return true;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  // Tax Recommendation (Based on Projected Adjusted Net Income)
  const recommendedCode = recommendTaxCode(projection.taxableIncome);
  const isCodeCorrect = taxCode.toUpperCase().trim() === recommendedCode.toUpperCase().trim();
  const trapAdvice = getTaxTrapAdvice(projection.taxableIncome, pensionPercent, baseSalary);

  // --- Handlers ---
  const addBaseItem = (type) => {
    const newItem = { id: Date.now().toString(), name: 'New Item', amount: '', frequency: 'monthly', type: type === 'sacrifice' ? 'salary_sacrifice' : 'income' };
    if (type === 'enhancement') setBaseEnhancements([...baseEnhancements, newItem]);
    else setBaseSacrifices([...baseSacrifices, newItem]);
  };

  const updateBaseItem = (type, id, field, val) => {
    const list = type === 'enhancement' ? [...baseEnhancements] : [...baseSacrifices];
    const updated = list.map(i => i.id === id ? { ...i, [field]: val } : i);
    if (type === 'enhancement') setBaseEnhancements(updated);
    else setBaseSacrifices(updated);
  };

  const removeBaseItem = (type, id) => {
    if (type === 'enhancement') setBaseEnhancements(baseEnhancements.filter(i => i.id !== id));
    else setBaseSacrifices(baseSacrifices.filter(i => i.id !== id));
  };

  const addMonthItem = (monthIdx, type) => {
    const n = [...months];
    const newItem = type === 'overtime'
      ? { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], reason: '', hours: '', multiplier: 1.5, claimed: false }
      : { id: Date.now().toString(), name: 'Item', amount: '', type: type === 'deductions' ? 'salary_sacrifice' : 'other' };
    n[monthIdx][type].push(newItem);
    setMonths(n);
  };

  const updateMonthItem = (monthIdx, type, id, field, val) => {
    const n = [...months];
    n[monthIdx][type] = n[monthIdx][type].map(i => i.id === id ? { ...i, [field]: val } : i);
    setMonths(n);
  };

  const removeMonthItem = (monthIdx, type, id) => {
    const n = [...months];
    n[monthIdx][type] = n[monthIdx][type].filter(i => i.id !== id);
    setMonths(n);
  };

  const clearCacheAndReload = () => {
    if (window.confirm("Perform hard reset? Your data is safe. Proceed?")) {
      navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister()));
      window.location.reload(true);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>TaxTracker <span style={{ fontSize: '0.8rem' }}>v10.1</span></h1>
        <p>UK Tax Year 2025/26 - Professional Grade</p>
      </header>

      {trapAdvice.active && (
        <div className="glass-card" style={{ border: '1px solid var(--error)', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <AlertTriangle color="var(--error)" />
            <div><strong>Tax Trap Alert:</strong> {trapAdvice.message} <p style={{ margin: 0, opacity: 0.8 }}>{trapAdvice.advice}</p></div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main style={{ paddingBottom: '5rem' }}>
        {activeTab === 'dashboard' && (
          <div className="dashboard-grid">
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>Monthly Summary</h2>
                <select className="input-field" style={{ width: 'auto', fontSize: '1.2rem' }} value={selectedMonthIdx} onChange={(e) => setSelectedMonthIdx(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.7 }}>
                  <span>Total Gross Monthly:</span>
                  <span>£{monthlyGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.7 }}>
                  <span>Tax & NI:</span>
                  <span style={{ color: 'var(--error)' }}>-£{(monthlyResultsAnnualized.incomeTax / 12 + monthlyResultsAnnualized.ni / 12).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.7 }}>
                  <span>Pension:</span>
                  <span style={{ color: 'var(--error)' }}>-£{(monthlyPension).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.7 }}>
                  <span>Net Deductions (Post-Tax):</span>
                  <span style={{ color: 'var(--error)' }}>-£{monthlyNetSacrifice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>Monthly Variable <Plus size={16} onClick={() => addMonthItem(selectedMonthIdx, 'deductions')} style={{ cursor: 'pointer' }} /></div>
              {months[selectedMonthIdx].deductions.map(d => (
                <div key={d.id} className="income-line">
                  <input placeholder="Name" value={d.name} onChange={(e) => updateMonthItem(selectedMonthIdx, 'deductions', d.id, 'name', e.target.value)} className="input-field" />
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      placeholder="Amt"
                      value={d.amount}
                      onChange={(e) => handleNumericInput(e.target.value, (v) => updateMonthItem(selectedMonthIdx, 'deductions', d.id, 'amount', v))}
                      className="input-field"
                    />
                    <select value={d.type} onChange={(e) => updateMonthItem(selectedMonthIdx, 'deductions', d.id, 'type', e.target.value)} className="input-field">
                      <option value="salary_sacrifice">Gross Sacrifice</option>
                      <option value="net_sacrifice">Net Sacrifice</option>
                      <option value="tax_free">Expense</option>
                      <option value="income">Income</option>
                    </select>
                    <button className="btn-icon" style={{ color: 'var(--error)' }} onClick={() => removeMonthItem(selectedMonthIdx, 'deductions', d.id)}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: '2rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="stat-label" style={{ margin: 0 }}>Estimated Net Pay:</span>
                  <strong style={{ fontSize: '1.5rem', color: 'var(--success)' }}>£{totalMonthlyNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
              </div>
            </div>

            <div className="glass-card">
              <h2 style={{ margin: 0 }}>Annual Forecast</h2>
              <div className="stat-value" style={{ color: 'var(--success)', fontSize: '2.2rem' }}>£{projection.finalTakeHome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem', opacity: 0.7 }}>
                <div><div className="stat-label">Taxable Income</div>£{projection.taxableIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div><div className="stat-label">Total Tax/NI</div>£{(projection.incomeTax + projection.ni).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <hr style={{ opacity: 0.1, margin: '1.5rem 0' }} />

              <div style={{ marginTop: '1rem' }}>
                <div className="stat-label">Current Tax Code</div>
                <div style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span style={{ color: isCodeCorrect ? 'white' : 'var(--error)', fontWeight: 'bold' }}>{taxCode}</span>
                  {!isCodeCorrect && <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>→ Recommended: {recommendedCode}</span>}
                </div>
                {!isCodeCorrect && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--error)', margin: 0 }}>Your local tax code differs from HMRC recommendations for your projected Adjusted Net Income.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'overtime' && (
          <div>
            <div className="glass-card" style={{ marginBottom: '2rem' }}>
              <h2 style={{ margin: 0 }}>Overtime Summary</h2>
              <div className="dashboard-grid" style={{ marginTop: '1.5rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '0.5rem' }}>
                  <div className="stat-label">YTD Earned</div>
                  <div className="stat-value" style={{ color: 'var(--primary)' }}>£{ytdOTTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '0.5rem' }}>
                  <div className="stat-label">Unclaimed</div>
                  <div className="stat-value" style={{ color: 'var(--error)' }}>£{allOvertime.filter(o => !o.claimed).reduce((s, o) => s + calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
              </div>
            </div>

            <div className="glass-card">
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center', gap: '1rem' }}>
                <h2 style={{ margin: 0 }}>Overtime Tracker</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select className="input-field" style={{ width: 'auto' }} value={otFilterMonth} onChange={(e) => setOtFilterMonth(e.target.value)}>
                    <option value="all">All Months</option>
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                  <select className="input-field" style={{ width: 'auto' }} value={otFilterClaimed} onChange={(e) => setOtFilterClaimed(e.target.value)}>
                    <option value="all">Status: All</option>
                    <option value="claimed">Claimed</option>
                    <option value="unclaimed">Unclaimed</option>
                  </select>
                  <button className="btn-primary" style={{ padding: '0.5rem' }} onClick={() => addMonthItem(otFilterMonth === 'all' ? selectedMonthIdx : Number(otFilterMonth), 'overtime')}><Plus size={20} /></button>
                </div>
              </div>

              {filteredOT.map(o => (
                <div key={o.id} className="overtime-line" style={{ borderLeft: o.claimed ? '4px solid var(--success)' : '4px solid var(--error)', paddingLeft: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                  <div className="ot-row">
                    <button className="btn-icon" onClick={() => updateMonthItem(o.monthIdx, 'overtime', o.id, 'claimed', !o.claimed)}>
                      {o.claimed ? <CheckSquare size={20} color="var(--success)" /> : <Square size={20} opacity={0.4} />}
                    </button>
                    <input type="date" value={o.date} onChange={(e) => updateMonthItem(o.monthIdx, 'overtime', o.id, 'date', e.target.value)} className="input-field" style={{ fontSize: '0.8rem' }} />
                    <input placeholder="Reason" value={o.reason} onChange={(e) => updateMonthItem(o.monthIdx, 'overtime', o.id, 'reason', e.target.value)} className="input-field" />
                    <input
                      placeholder="Hrs"
                      value={o.hours}
                      onChange={(e) => handleNumericInput(e.target.value, (v) => updateMonthItem(o.monthIdx, 'overtime', o.id, 'hours', v))}
                      className="input-field"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <select value={o.multiplier} onChange={(e) => updateMonthItem(o.monthIdx, 'overtime', o.id, 'multiplier', Number(e.target.value))} className="input-field" style={{ fontSize: '0.8rem', padding: '0.2rem' }}>
                        <option value={1.5}>1.5x</option><option value={2}>2x</option>
                      </select>
                      <span style={{ fontSize: '0.7rem', opacity: 0.5, textAlign: 'center' }}>£{calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier).toLocaleString()}</span>
                    </div>
                    <button className="btn-icon" style={{ color: 'var(--error)' }} onClick={() => removeMonthItem(o.monthIdx, 'overtime', o.id)}><Trash2 size={16} /></button>
                  </div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.4, marginTop: '0.25rem' }}>Log month: {o.monthName}</div>
                </div>
              ))}
              {filteredOT.length === 0 && <p style={{ textAlign: 'center', opacity: 0.4, padding: '2rem 0' }}>No overtime logged.</p>}
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="glass-card">
            <h2 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Settings size={20} /> Annual Configuration</h2>
            <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
              <div><label className="stat-label">Annual Salary (£)</label><input type="number" value={baseSalary} onChange={(e) => handleNumericInput(e.target.value, setBaseSalary)} className="input-field" /></div>
              <div><label className="stat-label">Contracted Hours (wk)</label><input type="number" value={contractedHours} onChange={(e) => handleNumericInput(e.target.value, setContractedHours)} className="input-field" /></div>
              <div><label className="stat-label">Tax Code</label><input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} className="input-field" /></div>
              <div><label className="stat-label">Base Pension %</label><input type="number" value={pensionPercent} onChange={(e) => handleNumericInput(e.target.value, setPensionPercent)} className="input-field" /></div>
            </div>

            <div className="dashboard-grid">
              <div>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>Recurring Enhancements <Plus size={16} onClick={() => addBaseItem('enhancement')} style={{ cursor: 'pointer' }} /></div>
                {baseEnhancements.map(e => (
                  <div key={e.id} className="income-line" style={{ marginBottom: '1rem' }}>
                    <input placeholder="Name" value={e.name} onChange={(v) => updateBaseItem('enhancement', e.id, 'name', v.target.value)} className="input-field" />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input type="number" placeholder="Amt" value={e.amount} onChange={(v) => handleNumericInput(v.target.value, (n) => updateBaseItem('enhancement', e.id, 'amount', n))} className="input-field" />
                      <select value={e.frequency} onChange={(v) => updateBaseItem('enhancement', e.id, 'frequency', v.target.value)} className="input-field">
                        <option value="annual">Annual</option><option value="monthly">Monthly</option><option value="hourly">Hourly</option>
                      </select>
                      <button className="btn-icon" onClick={() => removeBaseItem('enhancement', e.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>Recurring Sacrifices <Plus size={16} onClick={() => addBaseItem('sacrifice')} style={{ cursor: 'pointer' }} /></div>
                {baseSacrifices.map(d => (
                  <div key={d.id} className="income-line" style={{ marginBottom: '1rem' }}>
                    <input placeholder="Name" value={d.name} onChange={(v) => updateBaseItem('sacrifice', d.id, 'name', v.target.value)} className="input-field" />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input type="number" placeholder="Amt" value={d.amount} onChange={(v) => handleNumericInput(v.target.value, (n) => updateBaseItem('sacrifice', d.id, 'amount', n))} className="input-field" />
                      <select value={d.type} onChange={(v) => updateBaseItem('sacrifice', d.id, 'type', v.target.value)} className="input-field">
                        <option value="salary_sacrifice">Gross</option>
                        <option value="net_sacrifice">Net</option>
                      </select>
                      <select value={d.frequency} onChange={(v) => updateBaseItem('sacrifice', d.id, 'frequency', v.target.value)} className="input-field">
                        <option value="annual">Annual</option><option value="monthly">Monthly</option><option value="hourly">Hourly</option>
                      </select>
                      <button className="btn-icon" onClick={() => removeBaseItem('sacrifice', d.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: '3rem', textAlign: 'center' }}>
              <button onClick={clearCacheAndReload} className="btn-secondary">
                <RefreshCw size={14} style={{ marginRight: '0.5rem' }} /> Reset & Update Code
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Navigation Bar */}
      <nav className="nav-bar">
        <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </div>
        <div className={`nav-item ${activeTab === 'overtime' ? 'active' : ''}`} onClick={() => setActiveTab('overtime')}>
          <Clock size={20} />
          <span>OT Log</span>
        </div>
        <div className={`nav-item ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
          <Settings size={20} />
          <span>Settings</span>
        </div>
      </nav>
    </div>
  );
}

export default App;
