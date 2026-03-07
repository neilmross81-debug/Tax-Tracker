import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Download, Printer, Car, Receipt, TrendingUp, FileText, AlertCircle, CheckCircle, Clock, Briefcase, ShieldCheck } from 'lucide-react';
import {
    calculateClass2NI,
    calculateClass4NI,
    calculateMileageAllowance,
    calculateSEProfit,
    calculateSelfAssessment,
    calculateCapitalAllowances
} from './logic/SelfAssessmentCalculator';

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

const EXPENSE_CATEGORIES = [
    { value: 'office', label: 'Office & Admin', examples: 'Stationery, software, broadband' },
    { value: 'travel', label: 'Travel', examples: 'Public transport, hotels, parking' },
    { value: 'equipment', label: 'Equipment', examples: 'Laptop, tools, phone, peripherals' },
    { value: 'marketing', label: 'Marketing', examples: 'Ads, website, social media' },
    { value: 'professional', label: 'Professional Fees', examples: 'Accountant, legal, subscriptions' },
    { value: 'clothing', label: 'Clothing', examples: 'Uniforms & protective clothing only' },
    { value: 'other', label: 'Other', examples: 'Any other allowable expense' },
];

const ASSET_TYPES = [
    { value: 'equipment', label: 'Equipment / Tools (AIA 100%)' },
    { value: 'van', label: 'Van (AIA 100%)' },
    { value: 'ev', label: 'Electric Car (FYA 100%)' },
    { value: 'car_low', label: 'Car <= 50g/km (WDA 18%)' },
    { value: 'car_high', label: 'Car > 50g/km (WDA 6%)' },
];

const fmt = (n, dp = 2) => Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default function SelfEmployedTab({
    seData,
    onUpdateSEData,
    taxYear,
    payeANI,
    payeIncomeTaxPaid,
    taxCode,
    currentUser,
}) {
    const [subTab, setSubTab] = useState('income');
    const [selectedMonth, setSelectedMonth] = useState(0);

    const months = seData?.months || Array(12).fill(null).map(() => ({ invoices: [], expenses: [], mileage: [] }));
    const assets = seData?.assets || [];
    const vatRegistered = seData?.vatRegistered || false;
    const useTradingAllowance = seData?.useTradingAllowance || false;

    const updateMonth = (monthIdx, field, newArr) => {
        const updated = [...months];
        updated[monthIdx] = { ...updated[monthIdx], [field]: newArr };
        onUpdateSEData({ ...seData, months: updated });
    };

    const updateAssets = (newAssets) => {
        onUpdateSEData({ ...seData, assets: newAssets });
    };

    // --- Aggregated totals ---
    const totals = useMemo(() => {
        let totalIncome = 0, unpaidIncome = 0;
        let expensesByCategory = {};
        let totalExpenses = 0;
        let totalMiles = 0;

        months.forEach(m => {
            (m.invoices || []).forEach(inv => {
                const amt = Number(inv.amount || 0);
                if (inv.paid) totalIncome += amt;
                else unpaidIncome += amt;
            });
            (m.expenses || []).forEach(exp => {
                const amt = Number(exp.amount || 0);
                totalExpenses += amt;
                expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + amt;
            });
            (m.mileage || []).forEach(m2 => {
                totalMiles += Number(m2.miles || 0);
            });
        });

        const capitalAllowances = calculateCapitalAllowances(assets);
        const mileageCalc = calculateMileageAllowance(totalMiles, taxYear);
        const profitCalc = calculateSEProfit({
            grossIncome: totalIncome,
            totalExpenses,
            mileageAllowance: mileageCalc.totalAllowance,
            useTradingAllowance,
            capitalAllowances,
            taxYear
        });
        const sa = calculateSelfAssessment({ payeANI, payeIncomeTaxPaid, seProfit: profitCalc.profit, taxCode, taxYear });

        // Vehicle Advisor Logic: Mileage vs Actuals
        const vehicleActualCost = assets.filter(a => a.type.includes('car') || a.type === 'van' || a.type === 'ev').reduce((s, a) => s + calculateCapitalAllowances([a]), 0) + (expensesByCategory['travel'] || 0);
        const betterMethod = mileageCalc.totalAllowance >= vehicleActualCost ? 'mileage' : 'actuals';

        return { totalIncome, unpaidIncome, totalExpenses, expensesByCategory, totalMiles, mileageCalc, capitalAllowances, profitCalc, sa, betterMethod, vehicleActualCost };
    }, [months, assets, taxYear, useTradingAllowance, payeANI, payeIncomeTaxPaid, taxCode]);

    const addItem = (monthIdx, field, template) => {
        const arr = [...(months[monthIdx][field] || [])];
        arr.push({ id: Date.now().toString(), ...template });
        updateMonth(monthIdx, field, arr);
    };

    const updateItem = (monthIdx, field, id, key, val) => {
        const arr = (months[monthIdx][field] || []).map(i => i.id === id ? { ...i, [key]: val } : i);
        updateMonth(monthIdx, field, arr);
    };

    const removeItem = (monthIdx, field, id) => {
        const arr = (months[monthIdx][field] || []).filter(i => i.id !== id);
        updateMonth(monthIdx, field, arr);
    };

    const addAsset = () => {
        const newAssets = [...assets, { id: Date.now().toString(), name: '', cost: '', type: 'equipment' }];
        updateAssets(newAssets);
    };

    const updateAsset = (id, key, val) => {
        const newAssets = assets.map(a => a.id === id ? { ...a, [key]: val } : a);
        updateAssets(newAssets);
    };

    const removeAsset = (id) => {
        const newAssets = assets.filter(a => a.id !== id);
        updateAssets(newAssets);
    };

    const exportSAReport = () => {
        const win = window.open('', '_blank');
        const today = new Date().toLocaleDateString('en-GB');
        win.document.write(`
      <!DOCTYPE html><html><head>
      <title>Self Assessment Report - ${taxYear}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; color: #111; font-size: 14px; }
        h1 { color: #4f46e5; } h2 { color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th { background: #f9fafb; text-align: left; padding: 8px; border: 1px solid #e5e7eb; }
        td { padding: 8px; border: 1px solid #e5e7eb; }
        .total { font-weight: bold; background: #f9fafb; }
        .highlight { background: #eff6ff; font-weight: bold; }
        .warn { color: #b45309; background: #fffbeb; padding: 12px; border-radius: 6px; border: 1px solid #fde68a; margin: 16px 0; }
      </style></head><body>
      <h1>Self Assessment Summary</h1>
      <p><strong>Tax Year:</strong> ${taxYear} &nbsp; <strong>Generated:</strong> ${today}</p>

      <h2>Income Summary</h2>
      <table>
        <tr><th>Month</th><th>Client</th><th>Amount</th><th>Status</th></tr>
        ${months.flatMap((m, i) => (m.invoices || []).map(inv => `
          <tr><td>${MONTHS[i]}</td><td>${inv.invoiceNumber ? `[#${inv.invoiceNumber}] ` : ''}${inv.client || '—'}</td><td>£${fmt(inv.amount)}</td><td>${inv.paid ? 'Paid' : 'Unpaid'}</td></tr>
        `)).join('') || '<tr><td colspan="4">No invoices recorded</td></tr>'}
        <tr class="total"><td colspan="2"><strong>Total Paid Income</strong></td><td><strong>£${fmt(totals.totalIncome)}</strong></td><td></td></tr>
      </table>

      <h2>Expense Summary</h2>
      <table>
        <tr><th>Month</th><th>Category</th><th>Description</th><th>Amount</th></tr>
        ${months.flatMap((m, i) => (m.expenses || []).map(exp => `
          <tr><td>${MONTHS[i]}</td><td>${EXPENSE_CATEGORIES.find(c => c.value === exp.category)?.label || exp.category}</td><td>${exp.description || '—'}</td><td>£${fmt(exp.amount)}</td></tr>
        `)).join('') || '<tr><td colspan="4">No expenses recorded</td></tr>'}
        <tr class="total"><td colspan="3"><strong>Total Expenses</strong></td><td><strong>£${fmt(totals.totalExpenses)}</strong></td></tr>
      </table>

      <h2>Mileage Summary</h2>
      <table>
        <tr><th>Month</th><th>Description</th><th>Miles</th><th>HMRC Allowance</th></tr>
        ${months.flatMap((m, i) => (m.mileage || []).map(ml => {
            const v = Number(ml.miles || 0) <= 10000 ? Number(ml.miles) * 0.45 : 10000 * 0.45 + (Number(ml.miles) - 10000) * 0.25;
            return `<tr><td>${MONTHS[i]}</td><td>${ml.description || '—'}</td><td>${ml.miles}</td><td>£${fmt(v)}</td></tr>`;
        })).join('') || '<tr><td colspan="4">No mileage recorded</td></tr>'}
        <tr class="total"><td colspan="2"><strong>Total Mileage</strong></td><td><strong>${totals.totalMiles} miles</strong></td><td><strong>£${fmt(totals.mileageCalc.totalAllowance)}</strong></td></tr>
      </table>

      <h2>Profit Calculation</h2>
      <table>
        <tr><td>Gross Income (paid invoices)</td><td>£${fmt(totals.profitCalc.grossIncome)}</td></tr>
        <tr><td>${useTradingAllowance ? 'Trading Allowance' : 'Total Allowable Deductions'}</td><td>−£${fmt(totals.profitCalc.deduction)}</td></tr>
        <tr class="highlight"><td><strong>Taxable Profit</strong></td><td><strong>£${fmt(totals.profitCalc.profit)}</strong></td></tr>
      </table>

      <h2>Self Assessment Tax Estimate</h2>
      <table>
        <tr><td>Income Tax on SE profit (marginal)</td><td>£${fmt(totals.sa.seIncomeTax)}</td></tr>
        <tr><td>Class 2 NI</td><td>£${fmt(totals.sa.class2NI)}</td></tr>
        <tr><td>Class 4 NI</td><td>£${fmt(totals.sa.class4NI)}</td></tr>
        <tr class="highlight"><td><strong>Total SA Bill</strong></td><td><strong>£${fmt(totals.sa.totalSABill)}</strong></td></tr>
      </table>

      ${totals.sa.poaRequired ? `
      <h2>Payments on Account</h2>
      <div class="warn">⚠️ Payments on Account are required as your SA bill exceeds £1,000.</div>
      <table>
        <tr><td>${totals.sa.poa1Date} (1st Payment on Account)</td><td>£${fmt(totals.sa.poaAmount)}</td></tr>
        <tr><td>${totals.sa.poa2Date} (2nd Payment on Account)</td><td>£${fmt(totals.sa.poaAmount)}</td></tr>
        <tr class="highlight"><td><strong>January Payment (Bill + 1st PoA)</strong></td><td><strong>£${fmt(totals.sa.januaryPayment)}</strong></td></tr>
      </table>
      ` : '<p>✅ Payments on Account not required (SA bill under £1,000).</p>'}

      <p style="margin-top:32px;font-size:12px;color:#6b7280;">This report is an estimate only and should not be used as a formal tax return. Consult an accountant or use HMRC's Self Assessment service at gov.uk.</p>
      </body></html>
    `);
        win.document.close();
        win.print();
    };

    const subTabs = [
        { id: 'income', label: 'Income', icon: <TrendingUp size={16} /> },
        { id: 'expenses', label: 'Expenses', icon: <Receipt size={16} /> },
        { id: 'assets', label: 'Assets', icon: <Briefcase size={16} /> },
        { id: 'mileage', label: 'Mileage', icon: <Car size={16} /> },
        { id: 'summary', label: 'Summary', icon: <FileText size={16} /> },
    ];

    return (
        <div style={{ paddingBottom: '2rem' }}>
            {/* Header */}
            <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Briefcase size={20} color="var(--primary)" /> Self-Employment ({taxYear})
                        </h2>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', opacity: 0.5 }}>Sole Trader / Freelance Income Tracker</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Trading Allowance toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.8rem', borderRadius: '0.5rem', border: useTradingAllowance ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)' }}>
                            <input
                                type="checkbox"
                                checked={useTradingAllowance}
                                onChange={e => onUpdateSEData({ ...seData, useTradingAllowance: e.target.checked })}
                                style={{ display: 'none' }}
                            />
                            <span style={{ color: useTradingAllowance ? 'var(--primary)' : 'inherit' }}>
                                {useTradingAllowance ? '✓ ' : ''}Trading Allowance (£1k)
                            </span>
                        </label>
                        <button onClick={exportSAReport} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                            <Printer size={14} style={{ marginRight: '0.4rem' }} /> SA Report
                        </button>
                    </div>
                </div>

                {/* Key YTD stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>
                    {[
                        { label: 'Paid Income', value: `£${fmt(totals.totalIncome)}`, color: 'var(--success)' },
                        { label: 'Unpaid', value: `£${fmt(totals.unpaidIncome)}`, color: '#fbbf24' },
                        { label: 'Expenses', value: `£${fmt(totals.totalExpenses)}`, color: 'var(--error)' },
                        { label: 'Mileage', value: `${totals.totalMiles} mi`, color: 'var(--primary)' },
                        { label: 'Taxable Profit', value: `£${fmt(totals.profitCalc.profit)}`, color: 'var(--warning)' },
                        { label: 'SA Estimate', value: `£${fmt(totals.sa.totalSABill)}`, color: 'var(--error)' },
                    ].map(s => (
                        <div key={s.label} style={{ background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                            <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '0.25rem' }}>{s.label}</div>
                            <div style={{ fontWeight: 'bold', color: s.color }}>{s.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Sub-tab navigation */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.15)', borderRadius: '0.75rem', padding: '0.25rem' }}>
                {subTabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setSubTab(t.id)}
                        style={{
                            flex: 1,
                            padding: '0.6rem 0.25rem',
                            background: subTab === t.id ? 'var(--primary)' : 'transparent',
                            border: 'none',
                            borderRadius: '0.5rem',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            fontWeight: subTab === t.id ? 700 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3rem',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* Month selector (for income/expenses/mileage) */}
            {subTab !== 'summary' && subTab !== 'assets' && (
                <div style={{ marginBottom: '1rem' }}>
                    <select
                        className="input-field"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(Number(e.target.value))}
                        style={{ width: '100%', fontSize: '1rem' }}
                    >
                        {MONTHS.map((m, i) => (
                            <option key={m} value={i}>{m}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* --- INCOME TAB --- */}
            {subTab === 'income' && (
                <div className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0 }}>Invoices — {MONTHS[selectedMonth]}</h3>
                        <button className="btn-add" onClick={() => addItem(selectedMonth, 'invoices', { invoiceNumber: '', client: '', amount: '', date: new Date().toISOString().split('T')[0], paid: false })}>
                            <Plus size={16} />
                        </button>
                    </div>
                    {(months[selectedMonth].invoices || []).length === 0 && (
                        <p style={{ opacity: 0.4, textAlign: 'center', padding: '1.5rem 0' }}>No invoices for {MONTHS[selectedMonth]}. Tap + to add one.</p>
                    )}
                    {(months[selectedMonth].invoices || []).map(inv => (
                        <div key={inv.id} className="income-line" style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'rgba(0,0,0,0.1)', borderRadius: '0.5rem', borderLeft: `3px solid ${inv.paid ? 'var(--success)' : '#fbbf24'}` }}>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', width: '100%', alignItems: 'center' }}>
                                <input placeholder="Inv #" value={inv.invoiceNumber || ''} onChange={e => updateItem(selectedMonth, 'invoices', inv.id, 'invoiceNumber', e.target.value)} className="input-field" style={{ flex: '0 1 60px', minWidth: '50px' }} title="Invoice Number" />
                                <input placeholder="Client name" value={inv.client} onChange={e => updateItem(selectedMonth, 'invoices', inv.id, 'client', e.target.value)} className="input-field" style={{ flex: '2 1 120px' }} />
                                <input type="number" placeholder="Amt" value={inv.amount} onChange={e => updateItem(selectedMonth, 'invoices', inv.id, 'amount', e.target.value)} className="input-field" style={{ flex: '1 1 70px' }} />
                                <input type="date" value={inv.date} onChange={e => updateItem(selectedMonth, 'invoices', inv.id, 'date', e.target.value)} className="input-field" style={{ flex: '1 1 100px' }} />
                                <button
                                    onClick={() => updateItem(selectedMonth, 'invoices', inv.id, 'paid', !inv.paid)}
                                    style={{ background: inv.paid ? 'rgba(16,185,129,0.2)' : 'rgba(251,191,36,0.15)', border: `1px solid ${inv.paid ? 'var(--success)' : '#fbbf24'}`, color: inv.paid ? 'var(--success)' : '#fbbf24', borderRadius: '0.4rem', padding: '0.4rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                >
                                    {inv.paid ? '✓ Paid' : 'Unpaid'}
                                </button>
                                <button className="btn-icon" style={{ color: 'var(--error)' }} onClick={() => removeItem(selectedMonth, 'invoices', inv.id)}><Trash2 size={16} /></button>
                            </div>
                        </div>
                    ))}
                    <div style={{ marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', opacity: 0.7 }}>
                        <span>Month Total (Paid)</span>
                        <strong>£{fmt((months[selectedMonth].invoices || []).filter(i => i.paid).reduce((s, i) => s + Number(i.amount || 0), 0))}</strong>
                    </div>
                </div>
            )}

            {/* --- EXPENSES TAB --- */}
            {subTab === 'expenses' && (
                <div className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0 }}>Expenses — {MONTHS[selectedMonth]}</h3>
                        <button className="btn-add" onClick={() => addItem(selectedMonth, 'expenses', { category: 'office', description: '', amount: '' })}>
                            <Plus size={16} />
                        </button>
                    </div>
                    {useTradingAllowance && (
                        <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid #fbbf24', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#fbbf24' }}>
                            ⚠️ <strong>Trading Allowance is active.</strong> Itemised expenses won't reduce your profit — they're replaced by the flat £1,000 allowance. Disable it in the header if you want to claim actual expenses.
                        </div>
                    )}
                    {(months[selectedMonth].expenses || []).length === 0 && (
                        <p style={{ opacity: 0.4, textAlign: 'center', padding: '1.5rem 0' }}>No expenses for {MONTHS[selectedMonth]}.</p>
                    )}
                    {(months[selectedMonth].expenses || []).map(exp => (
                        <div key={exp.id} className="income-line" style={{ marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <select value={exp.category} onChange={e => updateItem(selectedMonth, 'expenses', exp.id, 'category', e.target.value)} className="input-field" style={{ flex: '2 1 130px' }}>
                                    {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                                <input placeholder="Description" value={exp.description} onChange={e => updateItem(selectedMonth, 'expenses', exp.id, 'description', e.target.value)} className="input-field" style={{ flex: '2 1 120px' }} />
                                <input type="number" placeholder="£ Amount" value={exp.amount} onChange={e => updateItem(selectedMonth, 'expenses', exp.id, 'amount', e.target.value)} className="input-field" style={{ flex: '1 1 80px' }} />
                                <button className="btn-icon" style={{ color: 'var(--error)' }} onClick={() => removeItem(selectedMonth, 'expenses', exp.id)}><Trash2 size={16} /></button>
                            </div>
                        </div>
                    ))}
                    {/* Category breakdown */}
                    {Object.keys(totals.expensesByCategory).length > 0 && (
                        <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                            <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Annual by Category</div>
                            {Object.entries(totals.expensesByCategory).map(([cat, amt]) => (
                                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                                    <span style={{ opacity: 0.7 }}>{EXPENSE_CATEGORIES.find(c => c.value === cat)?.label || cat}</span>
                                    <span>£{fmt(amt)}</span>
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                                <span>Total (Annual)</span>
                                <span>£{fmt(totals.totalExpenses)}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* --- ASSETS TAB --- */}
            {subTab === 'assets' && (
                <div className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0 }}>Assets & Capital Allowances</h3>
                        <button className="btn-add" onClick={addAsset}>
                            <Plus size={16} />
                        </button>
                    </div>
                    <div style={{ fontSize: '0.82rem', opacity: 0.6, marginBottom: '1.25rem' }}>
                        Log equipment or vehicles to claim tax relief (Capital Allowances).
                    </div>
                    {assets.map(asset => (
                        <div key={asset.id} style={{ marginBottom: '0.75rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <input placeholder="Asset Name" value={asset.name} onChange={e => updateAsset(asset.id, 'name', e.target.value)} className="input-field" style={{ flex: '2 1 150px' }} />
                                <input type="number" placeholder="Cost (£)" value={asset.cost} onChange={e => updateAsset(asset.id, 'cost', e.target.value)} className="input-field" style={{ flex: '1 1 100px' }} />
                                <select value={asset.type} onChange={e => updateAsset(asset.id, 'type', e.target.value)} className="input-field" style={{ flex: '2 1 200px' }}>
                                    {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                <button className="btn-icon" style={{ color: 'var(--error)' }} onClick={() => removeAsset(asset.id)}><Trash2 size={16} /></button>
                            </div>
                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', opacity: 0.6 }}>
                                <span>Relief Claimed this year:</span>
                                <strong style={{ color: 'var(--success)' }}>£{fmt(calculateCapitalAllowances([asset]))}</strong>
                            </div>
                        </div>
                    ))}
                    {assets.length === 0 && <p style={{ textAlign: 'center', opacity: 0.4, padding: '1.5rem 0' }}>No assets logged yet. Use these for 100% tax relief on gear.</p>}
                </div>
            )}

            {/* --- MILEAGE TAB --- */}
            {subTab === 'mileage' && (
                <div>
                    <div className="glass-card" style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0 }}>Mileage Log — {MONTHS[selectedMonth]}</h3>
                            <button className="btn-add" onClick={() => addItem(selectedMonth, 'mileage', { description: '', miles: '', date: new Date().toISOString().split('T')[0] })}>
                                <Plus size={16} />
                            </button>
                        </div>
                        {(months[selectedMonth].mileage || []).length === 0 && (
                            <p style={{ opacity: 0.4, textAlign: 'center', padding: '1.5rem 0' }}>No mileage for {MONTHS[selectedMonth]}.</p>
                        )}
                        {(months[selectedMonth].mileage || []).map(ml => (
                            <div key={ml.id} className="income-line" style={{ marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <input placeholder="Journey" value={ml.description} onChange={e => updateItem(selectedMonth, 'mileage', ml.id, 'description', e.target.value)} className="input-field" style={{ flex: '3 1 140px' }} />
                                    <input type="number" placeholder="Miles" value={ml.miles} onChange={e => updateItem(selectedMonth, 'mileage', ml.id, 'miles', e.target.value)} className="input-field" style={{ flex: '1 1 60px' }} />
                                    <button className="btn-icon" style={{ color: 'var(--error)' }} onClick={() => removeItem(selectedMonth, 'mileage', ml.id)}><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Vehicle Efficiency Advisor */}
                    <div className="glass-card" style={{ border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, transparent 100%)' }}>
                        <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldCheck size={18} color="var(--primary)" /> Vehicle Efficiency Advisor</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.15)', borderRadius: '0.5rem' }}>
                                <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Mileage Method (45p)</div>
                                <div style={{ fontWeight: 'bold' }}>£{fmt(totals.mileageCalc.totalAllowance)}</div>
                            </div>
                            <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.15)', borderRadius: '0.5rem' }}>
                                <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Actual Methods (Costs + WDA)</div>
                                <div style={{ fontWeight: 'bold' }}>£{fmt(totals.vehicleActualCost)}</div>
                            </div>
                        </div>
                        <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(99, 102, 241, 0.1)', fontSize: '0.85rem' }}>
                            {totals.betterMethod === 'mileage' ? (
                                <p style={{ margin: 0 }}>🌟 <strong>Recommendation:</strong> Use <strong>Mileage (Simplified Expenses)</strong>. It saves you ~£{fmt(totals.mileageCalc.totalAllowance - totals.vehicleActualCost)} in additional deductions.</p>
                            ) : (
                                <p style={{ margin: 0 }}>🚗 <strong>Recommendation:</strong> Use <strong>Actual Costs + Capital Allowances</strong>. Better by £{fmt(totals.vehicleActualCost - totals.mileageCalc.totalAllowance)}.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- SA SUMMARY TAB --- */}
            {subTab === 'summary' && (
                <div>
                    <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><TrendingUp size={18} color="var(--success)" /> Profit Calculation</h3>
                        {[
                            { label: 'Gross Income (paid invoices)', value: totals.profitCalc.grossIncome, color: 'var(--success)', prefix: '+' },
                            { label: useTradingAllowance ? 'Trading Allowance (£1,000 flat)' : 'Total Deductions (Inc. Capital)', value: totals.profitCalc.deduction, color: 'var(--error)', prefix: '−' },
                        ].map(row => (
                            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.8 }}>
                                <span>{row.label}</span>
                                <span style={{ color: row.color }}>{row.prefix}£{fmt(row.value)}</span>
                            </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--glass-border)' }}>
                            <span>Taxable Profit</span>
                            <span style={{ color: 'var(--warning)' }}>£{fmt(totals.profitCalc.profit)}</span>
                        </div>
                    </div>

                    {/* SA Bill */}
                    <div className="glass-card" style={{ marginBottom: '1.5rem', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.03)' }}>
                        <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--error)' }}>
                            <FileText size={18} /> Self Assessment Estimate
                        </h3>
                        {[
                            { label: 'Income Tax on SE profit (marginal)', value: totals.sa.seIncomeTax },
                            { label: 'Class 2 NI', value: totals.sa.class2NI, note: totals.sa.class2Note },
                            { label: 'Class 4 NI', value: totals.sa.class4NI },
                        ].map(row => (
                            <div key={row.label}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem', opacity: 0.8 }}>
                                    <span>{row.label}</span>
                                    <span style={{ color: 'var(--error)' }}>£{fmt(row.value)}</span>
                                </div>
                                {row.note && <div style={{ fontSize: '0.72rem', opacity: 0.45, marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>{row.note}</div>}
                            </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--glass-border)' }}>
                            <span>Total SA Bill</span>
                            <span style={{ color: 'var(--error)' }}>£{fmt(totals.sa.totalSABill)}</span>
                        </div>
                    </div>

                    {/* Payments on Account */}
                    <div className="glass-card" style={{ marginBottom: '1.5rem', border: totals.sa.poaRequired ? '1px solid #fbbf24' : '1px solid var(--glass-border)', background: totals.sa.poaRequired ? 'rgba(251,191,36,0.05)' : 'transparent' }}>
                        <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: totals.sa.poaRequired ? '#fbbf24' : 'white' }}>
                            <Clock size={18} /> Payments on Account
                        </h3>
                        {totals.sa.poaRequired ? (
                            <>
                                <div style={{ fontSize: '0.82rem', opacity: 0.65, marginBottom: '1rem' }}>
                                    Your SA bill exceeds £1,000, so HMRC requires advance payments toward next year's bill.
                                </div>
                                {[
                                    { date: totals.sa.poa1Date, label: '1st Payment on Account', amount: totals.sa.poaAmount },
                                    { date: totals.sa.poa2Date, label: '2nd Payment on Account', amount: totals.sa.poaAmount },
                                ].map(p => (
                                    <div key={p.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.15)', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                                        <div>
                                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{p.date}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.55 }}>{p.label}</div>
                                        </div>
                                        <div style={{ fontWeight: 'bold', color: '#fbbf24' }}>£{fmt(p.amount)}</div>
                                    </div>
                                ))}
                                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                        <span>January total (bill + 1st PoA)</span>
                                        <span style={{ color: 'var(--error)' }}>£{fmt(totals.sa.januaryPayment)}</span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', opacity: 0.5, marginTop: '0.3rem' }}>This is the total due in January — your actual bill plus the first advance payment.</div>
                                </div>
                            </>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.7 }}>
                                <CheckCircle size={18} color="var(--success)" />
                                <span style={{ fontSize: '0.9rem' }}>Payments on Account not required — SA bill is under £1,000.</span>
                            </div>
                        )}
                    </div>

                    <button onClick={exportSAReport} className="btn-primary" style={{ width: '100%', padding: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <Printer size={18} /> Generate SA Report (Print / PDF)
                    </button>
                </div>
            )}
        </div>
    );
}
