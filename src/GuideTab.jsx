import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Users, Calculator, Car, AlertTriangle, Calendar, Receipt, HelpCircle } from 'lucide-react';

const Section = ({ icon, title, badge, children }) => {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ marginBottom: '0.75rem', border: '1px solid var(--glass-border)', borderRadius: '0.75rem', overflow: 'hidden' }}>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '1rem', background: open ? 'var(--primary-light)' : 'rgba(255,255,255,0.02)',
                    border: 'none', color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left', gap: '0.75rem'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
                    <span style={{ color: 'var(--primary)' }}>{icon}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{title}</span>
                    {badge && (
                        <span style={{ fontSize: '0.65rem', background: 'var(--primary)', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '0.3rem', opacity: 0.8 }}>{badge}</span>
                    )}
                </div>
                {open ? <ChevronDown size={16} opacity={0.5} /> : <ChevronRight size={16} opacity={0.5} />}
            </button>
            {open && (
                <div style={{ padding: '1rem 1.1rem 1.1rem', fontSize: '0.87rem', lineHeight: 1.65, color: 'var(--text-main)', opacity: 0.9, borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.05)' }}>
                    {children}
                </div>
            )}
        </div>
    );
};

const Link = ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
        {children} <ExternalLink size={11} />
    </a>
);

const Table = ({ rows }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem', fontSize: '0.83rem' }}>
        <tbody>
            {rows.map(([a, b], i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.4rem 0.5rem', opacity: 0.6, whiteSpace: 'nowrap', color: 'var(--text-main)' }}>{a}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>{b}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

const Tip = ({ children }) => (
    <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem', marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--text-main)' }}>
        💡 {children}
    </div>
);

const Warn = ({ children }) => (
    <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem', marginTop: '0.75rem', fontSize: '0.82rem', color: '#fbbf24' }}>
        ⚠️ {children}
    </div>
);

export default function GuideTab({ taxYear, workMode }) {
    const startYear = parseInt((taxYear || '2025/26').split('/')[0]);
    const filingDeadline = `31 January ${startYear + 2}`;
    const poa2 = `31 July ${startYear + 2}`;
    const onlineFiling = `31 January ${startYear + 2}`;

    return (
        <div style={{ paddingBottom: '2rem' }}>
            <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <BookOpen size={20} color="var(--primary)" /> Tax Guide
                </h2>
                <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.5 }}>Plain-English answers to common tax questions. Tap any section to expand.</p>
            </div>

            {/* === SELF ASSESSMENT === */}
            <Section icon={<Calculator size={17} />} title="What is Self Assessment?" badge={workMode !== 'paye' ? 'SE' : null}>
                <p>Self Assessment (SA) is how HMRC collects tax from people whose income isn't fully taxed at source. If you're self-employed, a company director, or have income over £100,000, you must file a tax return each year.</p>
                <p style={{ marginTop: '0.75rem' }}>You tell HMRC what you earned, they work out what you owe, and you pay it — usually all at once in January.</p>
                <Table rows={[
                    ['Register by', '5 October after the tax year ends'],
                    ['Online filing deadline', onlineFiling],
                    ['Payment deadline', filingDeadline],
                    ['Paper filing deadline', `31 October ${startYear + 1}`],
                    ['Penalty (late filing)', '£100 immediately; more after 3 months'],
                ]} />
                <Tip>You can file any time after 5 April. Filing early avoids the January rush and lets you budget for the bill months in advance.</Tip>
            </Section>

            {/* === KEY DATES === */}
            <Section icon={<Calendar size={17} />} title={`Your Key Dates — ${taxYear}`}>
                <Table rows={[
                    ['5 April', `Tax year ${taxYear} ends`],
                    ['6 April', 'New tax year begins'],
                    ['31 July', poa2],
                    ['5 October', `Register for SA (if not already) for ${taxYear}`],
                    ['31 October', `Paper return deadline for ${taxYear}`],
                    ['31 January', filingDeadline],
                ].map(([d, l]) => [d, l])} />
                <Warn>The January deadline is the same date you file your return AND pay any balance — and in year 1, also the 1st Payment on Account. It can all hit at once.</Warn>
            </Section>

            {/* === TRADING ALLOWANCE === */}
            <Section icon={<Receipt size={17} />} title="Trading Allowance" badge="SE">
                <p>The Trading Allowance is a £1,000 tax-free amount for self-employed income. If your total self-employed income is under £1,000 for the year, you don't even need to report it to HMRC.</p>
                <p style={{ marginTop: '0.75rem' }}>If your income is <strong>over £1,000</strong>, you have a choice each year:</p>
                <Table rows={[
                    ['Option A — Trading Allowance', 'Deduct a flat £1,000. Simple, no receipts needed.'],
                    ['Option B — Actual Expenses', 'Deduct what you actually spent (requires records).'],
                ]} />
                <Warn>You cannot claim both. If your real expenses exceed £1,000, always use Option B — actual expenses will give you a bigger deduction and lower tax bill.</Warn>
                <Tip>The Trading Allowance is best for people with very low overheads — e.g. a tutor who only buys pens and books.</Tip>
            </Section>

            {/* === PAYMENTS ON ACCOUNT === */}
            <Section icon={<Calendar size={17} />} title="Payments on Account" badge="SE">
                <p>If your Self Assessment bill is over <strong>£1,000</strong>, HMRC requires you to make advance payments toward <em>next</em> year's estimated bill — these are called Payments on Account.</p>
                <p style={{ marginTop: '0.75rem' }}>Each payment is <strong>50% of your current bill</strong>.</p>
                <Table rows={[
                    ['1st Payment on Account', `31 January ${startYear + 2} (same day as your bill!)`],
                    ['2nd Payment on Account', `31 July ${startYear + 2}`],
                    ['Balancing payment', `31 January ${startYear + 3} (actual bill minus PoA paid)`],
                ]} />
                <Warn><strong>Year 1 shock:</strong> In your first year, you owe your full bill PLUS 50% advance in January — potentially 150% of your tax bill in one payment. Budget early.</Warn>
                <Tip>If your income drops significantly, you can apply to HMRC to reduce your Payments on Account. Don't just ignore them — they still charge interest if you underpay.</Tip>
            </Section>

            {/* === ALLOWABLE EXPENSES === */}
            <Section icon={<Receipt size={17} />} title="Allowable Expenses" badge="SE">
                <p>You can deduct allowable business expenses from your income to reduce your taxable profit. Keep receipts for everything.</p>
                <Table rows={[
                    ['✅ Office costs', 'Stationery, ink, printer paper, software'],
                    ['✅ Travel', 'Business journeys (not commuting), hotels on work trips'],
                    ['✅ Equipment', 'Laptop, tools, work phone — if used for business'],
                    ['✅ Marketing', 'Ads, website, business cards, social media costs'],
                    ['✅ Professional fees', 'Accountant, solicitor, professional subscriptions'],
                    ['✅ Clothing', 'Uniforms and protective clothing ONLY'],
                    ['❌ Commuting', 'Travel from home to your regular workplace'],
                    ['❌ Personal items', 'Anything with mixed business/personal use (unless split)'],
                    ['❌ Client entertainment', 'HMRC does not allow entertaining costs'],
                ]} />
                <Tip>If something is used partly for work (e.g. a phone), you can claim the work-use proportion — e.g. 60% if you use it 60% for work.</Tip>
            </Section>

            {/* === MILEAGE === */}
            <Section icon={<Car size={17} />} title="Mileage Rules" badge="SE">
                <p>Instead of claiming actual vehicle costs (fuel, insurance, repairs), most sole traders use the HMRC Approved Mileage Rate — it's simpler and often more generous.</p>
                <Table rows={[
                    ['First 10,000 miles', '45p per mile'],
                    ['Over 10,000 miles', '25p per mile'],
                    ['Motorcycles', '24p per mile (flat rate)'],
                    ['Bicycles', '20p per mile (flat rate)'],
                ]} />
                <Warn>You must keep a mileage log — date, destination, reason, and miles. HMRC can ask for it. The log in this app is designed to do exactly that.</Warn>
                <Tip>Once you've started claiming mileage on a vehicle, you generally have to continue using it (rather than switching to actual costs) for that vehicle's lifetime.</Tip>
            </Section>

            {/* === CLASS 2 & 4 NI === */}
            <Section icon={<Calculator size={17} />} title="Class 2 & Class 4 NI" badge="SE">
                <p>As a sole trader you don't pay the usual Class 1 NI (that's for employees). Instead you pay two types via your Self Assessment return:</p>
                <Table rows={[
                    ['Class 2 NI', '£3.45/week if profit > £12,570 (2025/26)'],
                    ['Class 2 credits', 'Profit between £6,725-£12,570: no payment but NI credit given'],
                    ['Class 4 NI (main)', '6% on profit from £12,570 to £50,270'],
                    ['Class 4 NI (upper)', '2% on profit above £50,270'],
                ]} />
                <Tip>Class 2 NI counts toward your State Pension entitlement — so it's worth paying even if your profit is low, as long as you're above the Small Profits Threshold.</Tip>
            </Section>

            {/* === PAYE + SE COMBINED === */}
            {workMode === 'both' && (
                <Section icon={<Users size={17} />} title="PAYE + Self-Employed Combined" badge="Important">
                    <p>HMRC taxes your <strong>total income from all sources</strong>. Your PAYE salary and self-employed profit are added together for income tax purposes.</p>
                    <Table rows={[
                        ['Band stacking', 'Your PAYE salary fills tax bands first. SE profit is taxed at the next rate up.'],
                        ['Personal Allowance', 'Your employer already uses your full £12,570 allowance via PAYE — SE profit is often taxed from £0.'],
                        ['NI', 'You pay Class 1 via payslip AND Class 2/4 on SE profit via SA — these are separate.'],
                        ['£100k trap', 'Combined income counts — £80k PAYE + £22k SE = £102k total, entering the 60% trap zone.'],
                        ['Student Loan', 'Repayments based on total income from both sources.'],
                    ]} />
                    <Warn>If your combined income is approaching £100,000, extra SE pension contributions (SIPP) can reduce your SE profit and pull your total ANI back below the threshold — saving 60p in every £1 above £100k.</Warn>
                </Section>
            )}

            {/* === VAT === */}
            <Section icon={<Calculator size={17} />} title="VAT" badge="SE">
                <p>VAT (Value Added Tax) is charged at 20% on most goods and services in the UK. You may only need to worry about VAT if your turnover is high.</p>
                <Table rows={[
                    ['Registration threshold', '£90,000 turnover in any 12-month period (2024/25+)'],
                    ['Voluntary registration', 'You can register even below the threshold — useful if clients are VAT registered'],
                    ['Standard rate', '20% on most goods and services'],
                    ['Zero rate', '0% on food, children\'s clothing, books'],
                    ['VAT returns', 'Usually quarterly, filed via HMRC\'s Making Tax Digital (MTD) service'],
                ]} />
                <Warn>HMRC checks your turnover on a rolling 12-month basis. If you hit £90k at any point in any 12-month period, you must register within 30 days.</Warn>
            </Section>

            {/* === USEFUL LINKS === */}
            <Section icon={<HelpCircle size={17} />} title="Useful Links">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.25rem' }}>
                    <Link href="https://www.gov.uk/self-assessment-tax-returns">HMRC: Self Assessment overview</Link>
                    <Link href="https://www.gov.uk/register-for-self-assessment">Register for Self Assessment</Link>
                    <Link href="https://www.gov.uk/self-employed-national-insurance-rates">Self-employed NI rates</Link>
                    <Link href="https://www.gov.uk/expenses-if-youre-self-employed">Allowable expenses guide (HMRC)</Link>
                    <Link href="https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim75005">HMRC mileage rates</Link>
                    <Link href="https://www.gov.uk/vat-registration">VAT registration</Link>
                    <Link href="https://www.gov.uk/tax-codes/how-to-update-your-tax-code">How to update your PAYE tax code</Link>
                    <Link href="https://www.gov.uk/estimate-self-assessment-penalties">Estimate penalties for late filing</Link>
                </div>
            </Section>

            <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.72rem', opacity: 0.35, lineHeight: 1.6 }}>
                This guide is for general information only. Tax rules change regularly — always verify with HMRC or a qualified accountant for your personal situation.
            </div>
        </div>
    );
}
