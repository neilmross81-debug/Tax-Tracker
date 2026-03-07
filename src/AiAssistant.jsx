import { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { X, Send, Bot, User, Sparkles, Paperclip, ImageIcon, Trash2 } from 'lucide-react';

// GEMINI_API_KEY is now managed via props in the App settings.
const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

const SUGGESTED_QUESTIONS = [
    "How can I reduce my tax bill?",
    "Am I paying too much tax?",
    "Should I increase my pension contributions?",
    "What is the best way to claim my vehicle expenses?",
    "What self-employed expenses can I claim?",
];

const buildSystemPrompt = (taxData, workMode, taxCode, taxYear) => {
    if (!taxData) return `You are a helpful UK tax advisor assistant.`;
    const {
        projections, seProfit, seSABill, totalTaxNI, totalTakeHome,
        payeUnderpayment, isCodeMismatch, recommendedCode,
        isMarriageAllowanceLikely, savings, totalMonthlyTaxPot,
    } = taxData;
    const workModeLabel = workMode === 'paye' ? 'PAYE Employee Only' : workMode === 'se' ? 'Self-Employed Only' : 'Both PAYE and Self-Employed';
    return `You are a knowledgeable, friendly UK tax advisor assistant embedded in the user's personal Tax Tracker app.
You have full access to the user's real financial data for the ${taxYear} tax year. Use it to give personalised, accurate advice.

--- USER'S FINANCIAL SNAPSHOT ---
Work Mode: ${workModeLabel}
Tax Code: ${taxCode} ${isCodeMismatch ? `(MISMATCH: recommended code is ${recommendedCode})` : '(correct)'}
Projected Annual Gross(PAYE): £${projections?.gross?.toLocaleString() ?? 0}
Income Tax Paid(PAYE): £${projections?.incomeTax?.toLocaleString() ?? 0}
National Insurance(PAYE): £${projections?.ni?.toLocaleString() ?? 0}
Pension Contributions: £${projections?.pensionContribution?.toLocaleString() ?? 0}
Salary Sacrifice Total: £${projections?.salarySacrifice?.toLocaleString() ?? 0}
${seProfit > 0 ? `Self-Employed Profit: £${seProfit.toLocaleString()}` : ''}
${seSABill > 0 ? `Self Assessment Tax Bill: £${seSABill.toLocaleString()}` : ''}
Total Tax & NI: £${totalTaxNI?.toLocaleString() ?? 0}
Projected Annual Take - Home: £${totalTakeHome?.toLocaleString() ?? 0}
Monthly Take - Home: £${projections?.monthlyTakeHome?.toLocaleString() ?? 0}
${payeUnderpayment > 50 ? `PAYE Underpayment: £${payeUnderpayment.toLocaleString()}` : ''}
${totalMonthlyTaxPot > 0 ? `Recommended Monthly Tax Set-Aside: £${totalMonthlyTaxPot.toLocaleString()}` : ''}
Sacrifice / Pension Savings: £${savings?.total?.toLocaleString() ?? 0}
${isMarriageAllowanceLikely ? 'Marriage Allowance: Potentially eligible (£252/yr saving)' : ''}
---

    Rules:
- Always refer to the user's actual numbers when giving advice.
    - Keep responses concise and friendly — use bullet points where helpful.
- Focus on HMRC - compliant, legal tax efficiency strategies.
- Never give advice that was not a recognised legal tax reduction strategy in the UK.
- If you don't know something specific, say so and suggest consulting an accountant.
    - Use £ for currency and UK tax terminology(e.g. "Personal Allowance", "Self Assessment", "National Insurance").
- The current tax year is ${taxYear}.`;
};

const buildPayslipExtractionPrompt = () => `You are analysing a UK payslip image for a Tax Tracker app.

Extract ALL pay and deduction line items from the payslip.Return your response in this EXACT JSON format(inside a \`\`\`json block):

\`\`\`json
{
  "payPeriod": "Month Year or null if not visible",
  "detectedMonthIndex": null,
  "grossPay": 0,
  "basicPay": 0,
  "overtime": 0,
  "bonus": 0,
  "otherPay": [],
  "incomeTax": 0,
  "nationalInsurance": 0,
  "pensionEmployee": 0,
  "salarySacrifice": [],
  "otherDeductions": [],
  "netPay": 0,
  "notes": ""
}
\`\`\`

Rules:
- All amounts should be the MONTHLY figures shown on the payslip (not YTD/cumulative).
- For "otherPay": list as [{label: "...", amount: 0}] e.g. bank holiday pay, allowances
- For "salarySacrifice": list as [{label: "...", amount: 0}] e.g. cycle to work, EV lease, childcare
- For "otherDeductions": list as [{label: "...", amount: 0}]
- For "detectedMonthIndex": if you can see the pay period month, set 0=April, 1=May, 2=June, 3=July, 4=August, 5=September, 6=October, 7=November, 8=December, 9=January, 10=February, 11=March. Set null if unclear.
- Use 0 for any fields not visible on the payslip — never guess.
- After the JSON, write a friendly summary of what you found and what you couldn't see clearly.
- Then ask: "Which month would you like me to update with this payslip data?" (mention the detected month if you found one, as a suggestion)`;

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

const parsePayslipJson = (text) => {
    try {
        const match = text.match(/```json\s*([\s\S]*?)```/);
        if (match) return JSON.parse(match[1]);
    } catch { }
    return null;
};

const detectPositiveConfirmation = (text) => {
    const t = text.toLowerCase().trim();
    return /^(yes|yeah|yep|ok|okay|sure|go ahead|do it|update|confirm|correct|absolutely|please|y)/.test(t);
};

export default function AiAssistant({ analyticsData, workMode, taxCode, taxYear, months, onUpdateMonth, geminiApiKey, onGoToSettings }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingPayslip, setPendingPayslip] = useState(null); // { data, awaitingMonth, monthIdx }
    const [previewImage, setPreviewImage] = useState(null);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    useEffect(() => {
        if (isOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100);
    }, [isOpen]);

    const applyPayslipToMonth = (monthIdx, data) => {
        if (!months || !onUpdateMonth) return;
        const newMonth = {
            income: [
                ...(data.basicPay > 0 ? [{ id: Date.now() + 1, type: 'base', label: 'Basic Pay', amount: String(data.basicPay) }] : []),
                ...(data.overtime > 0 ? [{ id: Date.now() + 2, type: 'base', label: 'Overtime', amount: String(data.overtime) }] : []),
                ...(data.bonus > 0 ? [{ id: Date.now() + 3, type: 'base', label: 'Bonus', amount: String(data.bonus) }] : []),
                ...(data.otherPay || []).map((p, i) => ({ id: Date.now() + 10 + i, type: 'base', label: p.label, amount: String(p.amount) })),
            ],
            deductions: [
                ...(data.incomeTax > 0 ? [{ id: Date.now() + 20, type: 'tax', label: 'Income Tax', amount: String(data.incomeTax) }] : []),
                ...(data.nationalInsurance > 0 ? [{ id: Date.now() + 21, type: 'ni', label: 'National Insurance', amount: String(data.nationalInsurance) }] : []),
                ...(data.pensionEmployee > 0 ? [{ id: Date.now() + 22, type: 'pension', label: 'Pension', amount: String(data.pensionEmployee) }] : []),
                ...(data.salarySacrifice || []).map((s, i) => ({ id: Date.now() + 30 + i, type: 'salary_sacrifice', label: s.label, amount: String(s.amount) })),
                ...(data.otherDeductions || []).map((d, i) => ({ id: Date.now() + 40 + i, type: 'net_sacrifice', label: d.label, amount: String(d.amount) })),
            ],
            overtime: months[monthIdx]?.overtime || [],
        };
        onUpdateMonth(monthIdx, newMonth);
    };

    const sendMessage = async (text, imageFile) => {
        const userText = (text || input).trim();
        if ((!userText && !imageFile) || isLoading) return;

        setInput('');
        setError('');
        setPreviewImage(null);

        // Check if user is confirming a pending payslip update
        if (pendingPayslip && !imageFile && userText) {
            if (pendingPayslip.awaitingMonth) {
                // User is specifying a month
                const lowerText = userText.toLowerCase();
                const monthIdx = MONTHS.findIndex(m => lowerText.includes(m.toLowerCase()));
                if (monthIdx !== -1) {
                    const pending = pendingPayslip;
                    setPendingPayslip({ ...pending, awaitingMonth: false, monthIdx });
                    const userMsg = { role: 'user', content: userText };
                    setMessages(prev => [...prev, userMsg, {
                        role: 'assistant',
                        content: `Got it — **${MONTHS[monthIdx]}**. Would you like me to update ${MONTHS[monthIdx]}'s data with the payslip figures?`,
                    }]);
                    setPendingPayslip({ ...pending, awaitingMonth: false, monthIdx });
                    return;
                }
            } else if (pendingPayslip.monthIdx !== null && detectPositiveConfirmation(userText)) {
                applyPayslipToMonth(pendingPayslip.monthIdx, pendingPayslip.data);
                const updatedMonth = MONTHS[pendingPayslip.monthIdx];
                setMessages(prev => [...prev,
                { role: 'user', content: userText },
                { role: 'assistant', content: `✅ Done! I've updated **${updatedMonth}** with the payslip data. Your calculations have been refreshed. You can check the Config tab to review the entries.` }
                ]);
                setPendingPayslip(null);
                return;
            } else if (!detectPositiveConfirmation(userText) && pendingPayslip.monthIdx !== null) {
                // User said no — clear pending
                setPendingPayslip(null);
            }
        }

        const newMessages = [...messages, { role: 'user', content: userText, image: imageFile ? URL.createObjectURL(imageFile) : null }];
        setMessages(newMessages);
        setIsLoading(true);

        if (!geminiApiKey) {
            setError('Please provide your Gemini API key in the Settings tab to use the AI Assistant.');
            setIsLoading(false);
            return;
        }

        try {
            const trimmedKey = geminiApiKey.trim();
            const genAI = new GoogleGenerativeAI(trimmedKey);

            const tryRequest = async (modelNames) => {
                let lastErr = null;
                for (const modelName of modelNames) {
                    try {
                        const model = genAI.getGenerativeModel({
                            model: modelName,
                            systemInstruction: imageFile ? undefined : (buildSystemPrompt(analyticsData, workMode, taxCode, taxYear) || "You are a helpful UK tax advisor assistant."),
                        });

                        if (imageFile) {
                            const base64 = await fileToBase64(imageFile);
                            const result = await model.generateContent([
                                { inlineData: { mimeType: imageFile.type, data: base64 } },
                                buildPayslipExtractionPrompt(),
                            ]);
                            return { responseText: result.response.text(), success: true };
                        } else {
                            const history = newMessages.slice(-10, -1)
                                .filter(m => !m.image)
                                .map(m => ({
                                    role: m.role === 'user' ? 'user' : 'model',
                                    parts: [{ text: m.content }]
                                }));
                            const chat = model.startChat({ history });
                            const result = await chat.sendMessage(userText);
                            return { responseText: result.response.text(), success: true };
                        }
                    } catch (e) {
                        const m = e.message || '';
                        console.warn(`Model ${modelName} failed:`, e);
                        // Prioritize "Limit 0" error as it's most descriptive for billing/setup issues
                        if (!lastErr || m.includes('limit: 0') || m.includes('PERMISSION_DENIED')) {
                            lastErr = e;
                        }
                    }
                }
                throw lastErr;
            };

            // Even more robust fallback list for new keys
            const { responseText } = await tryRequest([
                'gemini-1.5-flash',
                'gemini-1.5-flash-latest',
                'gemini-2.0-flash',
                'gemini-1.5-flash-8b',
                'gemini-1.5-flash-8b-latest',
                'gemini-2.0-flash-lite-preview-02-05',
                'gemini-2.0-flash-exp',
                'gemini-1.5-pro',
                'gemini-1.5-pro-latest'
            ]);

            if (imageFile) {
                const extracted = parsePayslipJson(responseText);
                const displayText = responseText.replace(/```json[\s\S]*?```/, '').trim();

                if (extracted) {
                    const detectedMonth = extracted.detectedMonthIndex;
                    const awaitingMonth = detectedMonth === null;
                    setPendingPayslip({ data: extracted, awaitingMonth, monthIdx: detectedMonth });
                    setMessages(prev => [...prev, { role: 'assistant', content: displayText }]);
                    if (!awaitingMonth) {
                        setTimeout(() => {
                            setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `I detected this payslip is for **${MONTHS[detectedMonth]}**. Would you like me to update that month's data with these figures?`
                            }]);
                        }, 400);
                    }
                } else {
                    setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
                }
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
            }
        } catch (err) {
            console.error('Gemini error:', err);
            const rawMessage = err.message || '';
            let errMsg = `Error: ${rawMessage || 'Could not reach AI. Please try again.'}`;

            if (rawMessage.includes('limit: 0')) {
                errMsg = "Google is reporting 'Limit 0'. This is normal for brand-new keys! Your project is currently 'thawing' on Google's servers. Please wait 5-10 minutes and try again — it will start working automatically.";
            } else if (rawMessage.includes('429')) {
                errMsg = `Google API Quota Error: ${rawMessage}. (Usually means 15 requests/min limit hit).`;
            } else if (rawMessage.includes('API_KEY_INVALID')) {
                errMsg = 'Your API Key appears to be invalid. Please check it in the Settings tab.';
            }

            setError(errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        setPreviewImage(URL.createObjectURL(file));
        await sendMessage('📎 [Payslip uploaded — scanning...]', file);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    const formatMessage = (content) => {
        return content.split('\n').map((line, i) => {
            if (line.startsWith('- ') || line.startsWith('• ')) {
                return <li key={i} style={{ marginLeft: '1rem', marginBottom: '0.25rem' }}>{line.replace(/^[-•] /, '')}</li>;
            }
            if (line === '') return <br key={i} />;
            return <p key={i} style={{ margin: '0.2rem 0' }} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') }} />;
        });
    };

    return (
        <>
            {/* Floating Toggle Button */}
            <button
                onClick={() => setIsOpen(o => !o)}
                style={{
                    position: 'fixed', bottom: '6rem', right: '1.5rem',
                    width: '3.5rem', height: '3.5rem', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    border: 'none', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(99,102,241,0.5)', zIndex: 1000,
                    transition: 'transform 0.2s', animation: 'pulse-glow 3s ease-in-out infinite',
                }}
                title="AI Tax Assistant"
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
                {isOpen ? <X size={20} color="white" /> : <Sparkles size={20} color="white" />}
            </button>

            {/* Chat Panel */}
            {isOpen && (
                <div style={{
                    position: 'fixed', bottom: '10.5rem', right: '1.5rem',
                    width: 'min(420px, calc(100vw - 2rem))', height: '540px',
                    background: 'var(--ai-panel-bg)', backdropFilter: 'blur(20px)',
                    border: '1px solid var(--ai-panel-border)', borderRadius: '1.25rem',
                    display: 'flex', flexDirection: 'column', zIndex: 1000,
                    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                    overflow: 'hidden',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '1rem 1.25rem',
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Bot size={14} color="white" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>AI Tax Assistant</div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Powered by Gemini · Payslip Scanner ✨</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                                onClick={() => {
                                    if (window.confirm("Clear all messages?")) {
                                        setMessages([]);
                                        setError('');
                                    }
                                }}
                                title="Clear chat history"
                                style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', cursor: 'pointer', padding: '0.4rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff8080' }}
                            >
                                <Trash2 size={14} />
                            </button>
                            <button
                                onClick={() => { fileInputRef.current?.click(); }}
                                title="Upload a payslip"
                                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', cursor: 'pointer', padding: '0.4rem 0.6rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'white', fontSize: '0.72rem', fontWeight: 600 }}
                            >
                                <ImageIcon size={14} /> <span>Scan Payslip</span>
                            </button>
                        </div>
                    </div>

                    {/* Payslip pending indicator */}
                    {pendingPayslip && (
                        <div style={{ padding: '0.5rem 1rem', background: 'rgba(99,102,241,0.1)', borderBottom: '1px solid rgba(99,102,241,0.2)', fontSize: '0.75rem', color: 'rgba(165,180,252,0.9)', flexShrink: 0 }}>
                            📋 Payslip scanned · {pendingPayslip.awaitingMonth ? 'Waiting for month confirmation' : pendingPayslip.monthIdx !== null ? `Ready to update ${MONTHS[pendingPayslip.monthIdx]}` : 'Confirm month'}
                        </div>
                    )}

                    {/* Messages Area */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {!geminiApiKey && messages.length === 0 && (
                            <div style={{
                                background: 'rgba(99, 102, 241, 0.1)',
                                border: '1px dashed var(--primary)',
                                padding: '1.5rem',
                                borderRadius: '0.75rem',
                                textAlign: 'center'
                            }}>
                                <Bot size={32} style={{ color: 'var(--primary)', marginBottom: '0.75rem' }} />
                                <h4 style={{ margin: '0 0 0.5rem 0' }}>Setup Required</h4>
                                <p style={{ fontSize: '0.85rem', opacity: 0.8, margin: '0 0 1rem 0' }}>
                                    To use the AI Tax Assistant, please enter your personal Gemini API key in the Settings.
                                </p>
                                <button
                                    onClick={() => {
                                        setIsOpen(false);
                                        onGoToSettings();
                                    }}
                                    className="btn-primary"
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                >
                                    Go to Settings
                                </button>
                            </div>
                        )}

                        {messages.length === 0 && geminiApiKey && (
                            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧑‍💼</div>
                                <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-main)' }}>Your personal tax advisor</div>
                                <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.5rem', color: 'var(--text-main)' }}>Ask me anything, or scan a payslip to auto-import your data.</div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                                        margin: '0 auto 1rem', background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))',
                                        border: '1px solid rgba(99,102,241,0.4)', borderRadius: '0.75rem',
                                        padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                        color: 'var(--text-main)'
                                    }}
                                >
                                    <ImageIcon size={15} /> 📎 Scan a Payslip
                                </button>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {SUGGESTED_QUESTIONS.map(q => (
                                        <button
                                            key={q}
                                            onClick={() => sendMessage(q)}
                                            style={{
                                                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                                                borderRadius: '0.6rem', padding: '0.5rem 0.75rem', color: 'var(--text-main)',
                                                cursor: 'pointer', fontSize: '0.78rem', textAlign: 'left', transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.25)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                                        >{q}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={i} style={{ display: 'flex', gap: '0.6rem', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                                <div style={{
                                    width: '1.8rem', height: '1.8rem', borderRadius: '50%', flexShrink: 0,
                                    background: msg.role === 'user' ? 'var(--input-bg)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)'
                                }}>
                                    {msg.role === 'user' ? <User size={10} color="var(--text-main)" /> : <Bot size={10} color="white" />}
                                </div>
                                <div style={{
                                    background: msg.role === 'user' ? 'rgba(99,102,241,0.15)' : 'var(--input-bg)',
                                    border: `1px solid ${msg.role === 'user' ? 'rgba(99,102,241,0.3)' : 'var(--glass-border)'}`,
                                    borderRadius: msg.role === 'user' ? '1rem 0.25rem 1rem 1rem' : '0.25rem 1rem 1rem 1rem',
                                    padding: '0.6rem 0.9rem', maxWidth: '85%', fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-main)',
                                }}>
                                    {msg.image && <img src={msg.image} alt="payslip" style={{ width: '100%', borderRadius: '0.5rem', marginBottom: '0.4rem', opacity: 0.85 }} />}
                                    {msg.role === 'user' && !msg.image ? msg.content : formatMessage(msg.content)}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                                <div style={{ width: '1.8rem', height: '1.8rem', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Bot size={10} color="white" />
                                </div>
                                <div style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: '0.25rem 1rem 1rem 1rem', padding: '0.75rem 1rem' }}>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                        {[0, 1, 2].map(i => (
                                            <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)', animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite` }} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#f87171' }}>
                                {error}
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'flex-end', background: 'var(--ai-panel-bg)' }}>
                        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            title="Upload payslip image"
                            style={{
                                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                                borderRadius: '0.75rem', padding: '0.6rem 0.65rem', cursor: 'pointer', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <Paperclip size={16} color="var(--primary)" />
                        </button>
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={pendingPayslip?.awaitingMonth ? "Which month is this payslip for?" : (pendingPayslip && pendingPayslip.monthIdx !== null) ? `Type 'yes' to update ${MONTHS[pendingPayslip.monthIdx]}…` : "Ask about your taxes…"}
                            rows={1}
                            style={{
                                flex: 1, background: 'var(--input-bg)', border: '1px solid var(--glass-border)',
                                borderRadius: '0.75rem', padding: '0.6rem 0.9rem', color: 'var(--text-main)', fontSize: '0.85rem',
                                resize: 'none', outline: 'none', lineHeight: 1.5, maxHeight: '100px', overflowY: 'auto',
                            }}
                        />
                        <button
                            onClick={() => sendMessage()}
                            disabled={!input.trim() || isLoading}
                            style={{
                                background: input.trim() && !isLoading ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--glass-border)',
                                border: 'none', borderRadius: '0.75rem', padding: '0.6rem 0.85rem',
                                cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed', transition: 'all 0.2s', flexShrink: 0,
                            }}
                        >
                            <Send size={16} color={input.trim() && !isLoading ? 'white' : 'var(--text-main)'} />
                        </button>
                    </div>
                </div>
            )}

            <style>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 4px 20px rgba(99,102,241,0.5); }
          50% { box-shadow: 0 4px 30px rgba(99,102,241,0.8), 0 0 0 6px rgba(99,102,241,0.1); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
        </>
    );
}
